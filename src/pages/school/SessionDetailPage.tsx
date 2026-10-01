import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { CheckCircle2, Download, PencilLine, PlayCircle, XCircle } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { useSchoolScope } from '@/scope/SchoolScope';
import { useClasses, useSchoolMutation, useStudents } from '@/hooks/useSchoolData';
import { updateSessionStatus, upsertImmunizationRecord, upsertMeasurementRecord } from '@/api/school';
import { errorMessage } from '@/api/errors';
import type {
  ImmunizationRecordRow,
  ImmunizationRecordStatus,
  ImmunizationSessionRow,
  MeasurementRecordRow,
  MeasurementSessionRow,
  SessionStatus,
} from '@/api/types';
import { toMeasurementView, type MeasurementView } from '@/lib/analytics';
import { formatDate, formatDateTime, formatDecimal, formatNumber, formatPercent } from '@/lib/format';
import { downloadCsv, slugify } from '@/lib/csv';
import { NUTRITION_COLORS } from '@/lib/nutrition';
import { Card, CardBody } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, FilterSelect, type Column } from '@/components/ui/DataTable';
import { IMMUNIZATION_STATUS_LABEL, ImmunizationStatusBadge, SessionStatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { Field, FormError, Input, Select, Textarea } from '@/components/ui/Form';
import { StatCard } from '@/components/ui/StatCard';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { KIND_META, useSessionData, type SessionKind } from './SessionsPage';

type AnySession = MeasurementSessionRow & Partial<Pick<ImmunizationSessionRow, 'vaccine_name' | 'dose_label' | 'officer_name'>>;

type RosterRow = {
  studentId: string;
  enrollmentId: string | null;
  name: string;
  studentNumber: string | null;
  inRoster: boolean;
  measurement: MeasurementView | null;
  immunization: ImmunizationRecordRow | null;
  recordedAt: string | null;
};

const CAPTURE_SOURCE_LABEL: Record<string, string> = {
  manual_form: 'Input manual',
  device_ble: 'Perangkat BLE',
  face_identification: 'Identifikasi wajah',
  batch: 'Batch',
  height_pose: 'Height pose',
};

export function SessionDetailPage({ kind }: { kind: SessionKind }) {
  const meta = KIND_META[kind];
  const { sessionId } = useParams();
  const { basePath, can, schoolName } = useSchoolScope();
  const toast = useToast();
  const { sessions, records } = useSessionData(kind);
  const students = useStudents();
  const classes = useClasses();
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<RosterRow | null>(null);
  const [statusTarget, setStatusTarget] = useState<SessionStatus | null>(null);
  const statusMutation = useSchoolMutation((status: SessionStatus, role) =>
    updateSessionStatus(kind, sessionId ?? '', status, role),
  );

  const session = ((sessions.data ?? []) as AnySession[]).find(item => item.id === sessionId) ?? null;
  const className = classes.data?.find(item => item.id === session?.class_id)?.name ?? '-';

  const roster = useMemo<RosterRow[]>(() => {
    if (!session) return [];
    const sessionRecords = ((records.data ?? []) as Array<MeasurementRecordRow | ImmunizationRecordRow>).filter(
      item => item.session_id === session.id,
    );
    const byStudent = new Map(sessionRecords.map(item => [item.student_id, item]));
    const toRow = (studentId: string, base: Omit<RosterRow, 'measurement' | 'immunization' | 'recordedAt'>): RosterRow => {
      const record = byStudent.get(studentId);
      if (!record) return { ...base, measurement: null, immunization: null, recordedAt: null };
      return kind === 'measurement'
        ? { ...base, measurement: toMeasurementView(record as MeasurementRecordRow), immunization: null, recordedAt: (record as MeasurementRecordRow).measured_at }
        : { ...base, measurement: null, immunization: record as ImmunizationRecordRow, recordedAt: (record as ImmunizationRecordRow).administered_at };
    };
    // Sama dengan mobile: roster = enrollment aktif di kelas sesi.
    const inClass = (students.data ?? []).filter(item => item.classId === session.class_id && item.isActive);
    const rows = inClass.map(item =>
      toRow(item.id, {
        studentId: item.id,
        enrollmentId: item.enrollmentId,
        name: item.student.full_name,
        studentNumber: item.student.student_number,
        inRoster: true,
      }),
    );
    // Record untuk siswa yang sudah pindah/nonaktif tetap ditampilkan.
    const known = new Set(rows.map(item => item.studentId));
    const allStudents = new Map((students.data ?? []).map(item => [item.id, item]));
    for (const record of sessionRecords) {
      if (known.has(record.student_id)) continue;
      const student = allStudents.get(record.student_id);
      rows.push(
        toRow(record.student_id, {
          studentId: record.student_id,
          enrollmentId: record.student_enrollment_id,
          name: student?.student.full_name ?? `Siswa ${record.student_id.slice(0, 8)}`,
          studentNumber: student?.student.student_number ?? null,
          inRoster: false,
        }),
      );
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name, 'id-ID'));
  }, [session, records.data, students.data, kind]);

  const error = sessions.error ?? records.error ?? students.error;
  if (error) {
    return (
      <Card>
        <ErrorState error={error} onRetry={() => void sessions.refetch()} />
      </Card>
    );
  }
  if (sessions.isLoading || records.isLoading || students.isLoading) return <LoadingState label="Memuat detail sesi…" variant="table" />;
  if (!session) {
    return (
      <Card>
        <EmptyState title="Sesi tidak ditemukan" description="Sesi mungkin sudah dihapus atau bukan milik sekolah ini." />
      </Card>
    );
  }

  const recorded = roster.filter(item => item.recordedAt).length;
  const rosterTotal = roster.filter(item => item.inRoster).length;
  const rosterRecorded = roster.filter(item => item.inRoster && item.recordedAt).length;
  const heights = roster.map(item => item.measurement?.heightCm).filter((value): value is number => typeof value === 'number');
  const weights = roster.map(item => item.measurement?.weightKg).filter((value): value is number => typeof value === 'number');
  const avg = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
  const given = roster.filter(item => item.immunization?.status === 'given').length;

  const filtered = roster.filter(row => {
    if (filter === 'done') return Boolean(row.recordedAt);
    if (filter === 'pending') return !row.recordedAt;
    if (filter.startsWith('imm:')) return row.immunization?.status === filter.slice(4);
    return true;
  });

  const measurementColumns: Column<RosterRow>[] = [
    { key: 'height', header: 'TB (cm)', sortValue: row => row.measurement?.heightCm, cell: row => formatDecimal(row.measurement?.heightCm) },
    { key: 'weight', header: 'BB (kg)', sortValue: row => row.measurement?.weightKg, cell: row => formatDecimal(row.measurement?.weightKg) },
    {
      key: 'bmi',
      header: 'IMT / status',
      sortValue: row => row.measurement?.bmi,
      cell: row =>
        row.measurement?.category ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: NUTRITION_COLORS[row.measurement.category] }} aria-hidden />
            {formatDecimal(row.measurement.bmi)} · {row.measurement.category}
          </span>
        ) : (
          '-'
        ),
    },
    {
      key: 'source',
      header: 'Metode',
      cell: row =>
        row.measurement ? (
          <span className="text-xs text-fg-muted">
            {CAPTURE_SOURCE_LABEL[row.measurement.record.capture_source] ?? row.measurement.record.capture_source}
            {row.measurement.record.device_name ? ` · ${row.measurement.record.device_name}` : ''}
          </span>
        ) : (
          '-'
        ),
    },
  ];
  const immunizationColumns: Column<RosterRow>[] = [
    {
      key: 'status',
      header: 'Status',
      sortValue: row => row.immunization?.status,
      cell: row => (row.immunization ? <ImmunizationStatusBadge status={row.immunization.status} /> : <span className="text-fg-subtle">Belum dicatat</span>),
    },
    {
      key: 'vaccine',
      header: 'Vaksin / dosis',
      cell: row =>
        row.immunization ? `${row.immunization.vaccine_name}${row.immunization.dose_label ? ` · ${row.immunization.dose_label}` : ''}` : '-',
    },
    { key: 'batch', header: 'No. batch', cell: row => row.immunization?.batch_number ?? '-' },
    {
      key: 'kipi',
      header: 'KIPI / catatan',
      cell: row => (
        <span className="line-clamp-2 max-w-[14rem] text-xs text-fg-muted">
          {row.immunization?.adverse_event_notes ?? row.immunization?.notes ?? '-'}
        </span>
      ),
    },
  ];

  const columns: Column<RosterRow>[] = [
    {
      key: 'name',
      header: 'Siswa',
      sortValue: row => row.name,
      cell: row => (
        <div>
          <p className="font-medium text-fg">{row.name}</p>
          <p className="text-xs text-fg-subtle">
            NISN {row.studentNumber ?? '-'}
            {!row.inRoster ? ' · tidak lagi di kelas ini' : ''}
          </p>
        </div>
      ),
    },
    ...(kind === 'measurement' ? measurementColumns : immunizationColumns),
    { key: 'time', header: 'Dicatat', sortValue: row => row.recordedAt, cell: row => <span className="text-xs">{formatDateTime(row.recordedAt)}</span> },
    ...(!can.recordData || session.status === 'cancelled'
      ? []
      : [
          {
            key: 'actions',
            header: '',
            className: 'text-right',
            cell: (row: RosterRow) => (
              <Button variant="ghost" size="sm" icon={<PencilLine className="size-3.5" />} onClick={() => setEditing(row)}>
                {row.recordedAt ? 'Ubah' : 'Input'}
              </Button>
            ),
          },
        ]),
  ];

  const exportCsv = () =>
    downloadCsv(`${meta.path}-${slugify(session.name)}-${slugify(schoolName)}`, roster, [
      { header: 'Nama', value: row => row.name },
      { header: 'NISN', value: row => row.studentNumber },
      { header: 'Kelas', value: () => className },
      ...(kind === 'measurement'
        ? [
            { header: 'Tinggi (cm)', value: (row: RosterRow) => row.measurement?.heightCm },
            { header: 'Berat (kg)', value: (row: RosterRow) => row.measurement?.weightKg },
            { header: 'IMT', value: (row: RosterRow) => (row.measurement?.bmi ? row.measurement.bmi.toFixed(1) : '') },
            { header: 'Status Gizi', value: (row: RosterRow) => row.measurement?.category },
            { header: 'Metode', value: (row: RosterRow) => row.measurement?.record.capture_source },
            { header: 'Catatan', value: (row: RosterRow) => row.measurement?.record.notes },
          ]
        : [
            { header: 'Status', value: (row: RosterRow) => (row.immunization ? IMMUNIZATION_STATUS_LABEL[row.immunization.status] : 'Belum dicatat') },
            { header: 'Vaksin', value: (row: RosterRow) => row.immunization?.vaccine_name },
            { header: 'Dosis', value: (row: RosterRow) => row.immunization?.dose_label },
            { header: 'Petugas', value: (row: RosterRow) => row.immunization?.officer_name },
            { header: 'No. Batch', value: (row: RosterRow) => row.immunization?.batch_number },
            { header: 'Lokasi Suntik', value: (row: RosterRow) => row.immunization?.injection_site },
            { header: 'KIPI', value: (row: RosterRow) => row.immunization?.adverse_event_notes },
            { header: 'Catatan', value: (row: RosterRow) => row.immunization?.notes },
          ]),
      { header: 'Waktu Dicatat', value: row => row.recordedAt },
    ]);

  const statusActions: Array<{ status: SessionStatus; label: string; icon: ReactNode; variant: 'secondary' | 'danger' }> = [];
  if (can.manageSessions) {
    if (session.status === 'active' || session.status === 'draft') {
      statusActions.push({ status: 'completed', label: 'Tandai selesai', icon: <CheckCircle2 className="size-4" />, variant: 'secondary' });
      statusActions.push({ status: 'cancelled', label: 'Batalkan', icon: <XCircle className="size-4" />, variant: 'danger' });
    } else {
      statusActions.push({ status: 'active', label: 'Aktifkan kembali', icon: <PlayCircle className="size-4" />, variant: 'secondary' });
    }
  }

  return (
    <div>
      <PageHeader
        backTo={`${basePath}/${meta.path}`}
        backLabel={meta.title}
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            {session.name} <SessionStatusBadge status={session.status} />
          </span>
        }
        description={
          <>
            {className} · {formatDate(session.session_date)}
            {kind === 'immunization'
              ? ` · ${session.vaccine_name ?? ''}${session.dose_label ? ` (${session.dose_label})` : ''}${session.officer_name ? ` · Petugas: ${session.officer_name}` : ''}`
              : ''}
          </>
        }
        actions={
          <>
            {statusActions.map(action => (
              <Button key={action.status} variant={action.variant} size="sm" icon={action.icon} onClick={() => setStatusTarget(action.status)}>
                {action.label}
              </Button>
            ))}
            <Button variant="secondary" size="sm" icon={<Download className="size-3.5" />} onClick={exportCsv}>
              Ekspor CSV
            </Button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Progres kelas"
          value={formatPercent(rosterTotal > 0 ? rosterRecorded / rosterTotal : null)}
          progress={rosterTotal > 0 ? rosterRecorded / rosterTotal : null}
          hint={`${rosterRecorded} dari ${rosterTotal} siswa aktif`}
        />
        <StatCard label="Total record" value={formatNumber(recorded)} hint={`${rosterTotal - rosterRecorded} siswa belum dicatat`} />
        {kind === 'measurement' ? (
          <>
            <StatCard label="Rata-rata tinggi" value={`${formatDecimal(avg(heights))} cm`} />
            <StatCard label="Rata-rata berat" value={`${formatDecimal(avg(weights))} kg`} />
          </>
        ) : (
          <>
            <StatCard label="Diberikan" value={formatNumber(given)} hint="status given" />
            <StatCard label="Ditunda / ditolak / absen" value={formatNumber(recorded - given)} />
          </>
        )}
      </div>

      {session.note ? (
        <Card className="mb-5">
          <CardBody className="text-sm text-fg-muted">
            <span className="font-medium text-fg">Catatan sesi: </span>
            {session.note}
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <DataTable
          rows={filtered}
          columns={columns}
          getRowId={row => row.studentId}
          getSearchText={row => `${row.name} ${row.studentNumber ?? ''}`}
          searchPlaceholder="Cari siswa"
          initialPageSize={25}
          initialSort={{ key: 'name', dir: 'asc' }}
          emptyTitle="Belum ada siswa di kelas ini"
          filters={
            <FilterSelect
              label="Filter"
              value={filter}
              onChange={setFilter}
              options={[
                { value: '', label: 'Semua siswa' },
                { value: 'done', label: 'Sudah dicatat' },
                { value: 'pending', label: 'Belum dicatat' },
                ...(kind === 'immunization'
                  ? (Object.keys(IMMUNIZATION_STATUS_LABEL) as ImmunizationRecordStatus[]).map(status => ({
                      value: `imm:${status}`,
                      label: IMMUNIZATION_STATUS_LABEL[status],
                    }))
                  : []),
              ]}
            />
          }
        />
      </Card>

      {editing ? <RecordModal kind={kind} session={session} row={editing} onClose={() => setEditing(null)} /> : null}
      <ConfirmDialog
        open={statusTarget !== null}
        danger={statusTarget === 'cancelled'}
        title="Ubah status sesi?"
        message={
          statusTarget === 'cancelled'
            ? 'Sesi yang dibatalkan tidak dihitung dalam statistik ringkasan.'
            : statusTarget === 'completed'
              ? 'Sesi akan ditandai selesai. Record yang sudah ada tetap tersimpan.'
              : 'Sesi akan diaktifkan kembali.'
        }
        loading={statusMutation.isPending}
        onClose={() => setStatusTarget(null)}
        onConfirm={async () => {
          if (!statusTarget) return;
          try {
            await statusMutation.mutateAsync(statusTarget);
            toast.success('Status sesi diperbarui.');
            setStatusTarget(null);
          } catch (statusError) {
            toast.error(errorMessage(statusError));
          }
        }}
      />
    </div>
  );
}

function RecordModal({
  kind,
  session,
  row,
  onClose,
}: {
  kind: SessionKind;
  session: AnySession;
  row: RosterRow;
  onClose: () => void;
}) {
  const { userId } = useAuth();
  const toast = useToast();
  const m = row.measurement;
  const i = row.immunization;
  const [form, setForm] = useState({
    height: m?.heightCm?.toString() ?? '',
    weight: m?.weightKg?.toString() ?? '',
    notes: (kind === 'measurement' ? m?.record.notes : i?.notes) ?? '',
    status: (i?.status ?? 'given') as ImmunizationRecordStatus,
    vaccineName: i?.vaccine_name ?? session.vaccine_name ?? '',
    doseLabel: i?.dose_label ?? session.dose_label ?? '',
    officerName: i?.officer_name ?? session.officer_name ?? '',
    batchNumber: i?.batch_number ?? '',
    injectionSite: i?.injection_site ?? '',
    adverseEventNotes: i?.adverse_event_notes ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form, value: string) => setForm(current => ({ ...current, [key]: value }));

  const mutation = useSchoolMutation(async (input: typeof form, role) => {
    if (!userId) throw new Error('Data user tidak ditemukan. Silakan login ulang.');
    const base = { sessionId: session.id, studentId: row.studentId, studentEnrollmentId: row.enrollmentId, recordedBy: userId };
    if (kind === 'measurement') {
      const parse = (value: string) => (value.trim() ? Number(value.replace(',', '.')) : null);
      await upsertMeasurementRecord({ ...base, heightCm: parse(input.height), weightKg: parse(input.weight), notes: input.notes }, role);
    } else {
      await upsertImmunizationRecord({ ...base, ...input }, role);
    }
  });

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (kind === 'measurement') {
      const height = form.height.trim() ? Number(form.height.replace(',', '.')) : null;
      const weight = form.weight.trim() ? Number(form.weight.replace(',', '.')) : null;
      if (height === null && weight === null) return setError('Isi minimal tinggi atau berat badan.');
      // Rentang mengikuti CHECK constraint di measurement_recording_schema.sql
      if (height !== null && (!Number.isFinite(height) || height < 30 || height > 250)) return setError('Tinggi harus 30–250 cm.');
      if (weight !== null && (!Number.isFinite(weight) || weight < 1 || weight > 300)) return setError('Berat harus 1–300 kg.');
    } else if (!form.vaccineName.trim()) {
      return setError('Jenis imunisasi wajib diisi.');
    }
    try {
      await mutation.mutateAsync(form);
      toast.success('Data tersimpan.');
      onClose();
    } catch (submitError) {
      setError(errorMessage(submitError));
    }
  };

  return (
    <Modal
      open
      title={kind === 'measurement' ? 'Input pengukuran' : 'Input imunisasi'}
      description={`${row.name} · input manual (sama dengan mode manual di aplikasi mobile)`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Batal
          </Button>
          <Button type="submit" form="record-form" loading={mutation.isPending}>
            Simpan
          </Button>
        </>
      }
    >
      <form id="record-form" onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <FormError message={error} />
        </div>
        {kind === 'measurement' ? (
          <>
            <Field label="Tinggi badan (cm)">
              {id => <Input id={id} inputMode="decimal" value={form.height} onChange={e => set('height', e.target.value)} placeholder="mis. 125.5" />}
            </Field>
            <Field label="Berat badan (kg)">
              {id => <Input id={id} inputMode="decimal" value={form.weight} onChange={e => set('weight', e.target.value)} placeholder="mis. 28.2" />}
            </Field>
          </>
        ) : (
          <>
            <Field label="Status *">
              {id => (
                <Select id={id} value={form.status} onChange={e => set('status', e.target.value)}>
                  {(Object.keys(IMMUNIZATION_STATUS_LABEL) as ImmunizationRecordStatus[]).map(status => (
                    <option key={status} value={status}>
                      {IMMUNIZATION_STATUS_LABEL[status]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Vaksin *">{id => <Input id={id} value={form.vaccineName} onChange={e => set('vaccineName', e.target.value)} />}</Field>
            <Field label="Dosis">{id => <Input id={id} value={form.doseLabel} onChange={e => set('doseLabel', e.target.value)} />}</Field>
            <Field label="Petugas">{id => <Input id={id} value={form.officerName} onChange={e => set('officerName', e.target.value)} />}</Field>
            <Field label="No. batch">{id => <Input id={id} value={form.batchNumber} onChange={e => set('batchNumber', e.target.value)} />}</Field>
            <Field label="Lokasi suntik">{id => <Input id={id} value={form.injectionSite} onChange={e => set('injectionSite', e.target.value)} />}</Field>
            <Field label="KIPI (kejadian ikutan pasca imunisasi)" className="sm:col-span-2">
              {id => <Textarea id={id} value={form.adverseEventNotes} onChange={e => set('adverseEventNotes', e.target.value)} />}
            </Field>
          </>
        )}
        <Field label="Catatan" className="sm:col-span-2">
          {id => <Textarea id={id} value={form.notes} onChange={e => set('notes', e.target.value)} />}
        </Field>
      </form>
    </Modal>
  );
}

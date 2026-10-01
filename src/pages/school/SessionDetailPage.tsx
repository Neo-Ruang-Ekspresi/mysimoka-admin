import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';
import { CheckCircle2, Download, Pencil, PencilLine, PlayCircle, Trash2, XCircle } from 'lucide-react';
import { useSchoolScope } from '@/scope/SchoolScope';
import { useClasses, useSchoolMutation, useStudents } from '@/hooks/useSchoolData';
import { useDrawerState, useSelection } from '@/hooks/useCrud';
import { deleteRecord, deleteRecords } from '@/api/crud/records';
import type { ImmunizationRecordRow, ImmunizationRecordStatus, MeasurementRecordRow, SessionStatus } from '@/api/types';
import { toMeasurementView, type MeasurementView } from '@/lib/analytics';
import { formatDate, formatDateTime, formatDecimal, formatNumber, formatPercent } from '@/lib/format';
import { downloadCsv, slugify } from '@/lib/csv';
import { NUTRITION_COLORS } from '@/lib/nutrition';
import { Card, CardBody } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, FilterSelect, type Column } from '@/components/ui/DataTable';
import { IMMUNIZATION_STATUS_LABEL, ImmunizationStatusBadge, SessionStatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { RowActions } from '@/components/ui/RowActions';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { StatCard } from '@/components/ui/StatCard';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { ExportButton } from '@/components/importExport/ExportButton';
import { KIND_META, useSessionData, type SessionKind } from './SessionsPage';
import { SessionFormDrawer, type AnySession } from './sessions/SessionFormDrawer';
import { RecordFormDrawer } from './sessions/RecordFormDrawer';
import { useSessionActions } from './sessions/useSessionActions';

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
  const navigate = useNavigate();
  const confirm = useConfirm();
  const recordEditor = useDrawerState<RosterRow>();
  const sessionEditor = useDrawerState<true>();
  const selection = useSelection();
  const { askStatus, askDelete } = useSessionActions(kind);
  const removeRecord = useSchoolMutation((id: string, role) => deleteRecord(kind, id, role));
  const removeRecords = useSchoolMutation((ids: string[], role) => deleteRecords(kind, sessionId ?? '', ids, role));

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

  const recordIdOf = (row: RosterRow) => (kind === 'measurement' ? row.measurement?.record.id : row.immunization?.id) ?? null;
  const canRecord = can.recordData && session.status !== 'cancelled';

  const askDeleteRecords = (targets: RosterRow[], onDone?: () => void) => {
    const ids = targets.map(recordIdOf).filter((id): id is string => Boolean(id));
    if (ids.length === 0) return;
    const label = targets.length === 1 ? `data ${targets[0].name}` : `${ids.length} data siswa`;
    void confirm({
      title: targets.length === 1 ? 'Hapus data siswa?' : `Hapus ${ids.length} data?`,
      tone: 'danger',
      confirmLabel: 'Hapus',
      message: `${label[0].toUpperCase()}${label.slice(1)} di sesi "${session.name}" akan dihapus permanen. Siswa akan kembali berstatus "belum dicatat".`,
      onConfirm: async () => {
        if (ids.length === 1) await removeRecord.mutateAsync(ids[0]);
        else await removeRecords.mutateAsync(ids);
        toast.success(ids.length === 1 ? 'Data dihapus.' : `${ids.length} data dihapus.`);
        onDone?.();
      },
    });
  };

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
    ...(!canRecord && !can.deleteData
      ? []
      : [
          {
            key: 'actions',
            header: '',
            className: 'text-right whitespace-nowrap',
            cell: (row: RosterRow) =>
              !row.recordedAt ? (
                canRecord ? (
                  <Button variant="ghost" size="sm" icon={<PencilLine className="size-3.5" />} onClick={() => recordEditor.show(row)}>
                    Input
                  </Button>
                ) : null
              ) : (
                <RowActions
                  actions={[
                    { label: 'Ubah data', icon: <Pencil className="size-4" />, hidden: !canRecord, onSelect: () => recordEditor.show(row) },
                    {
                      label: 'Hapus data',
                      icon: <Trash2 className="size-4" />,
                      tone: 'danger',
                      hidden: !can.deleteData,
                      onSelect: () => askDeleteRecords([row]),
                    },
                  ]}
                />
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
              <Button key={action.status} variant={action.variant} size="sm" icon={action.icon} onClick={() => void askStatus([session], action.status)}>
                {action.label}
              </Button>
            ))}
            {can.manageSessions ? (
              <Button variant="secondary" size="sm" icon={<Pencil className="size-4" />} onClick={() => sessionEditor.show(true)}>
                Ubah sesi
              </Button>
            ) : null}
            {can.deleteData ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-danger"
                icon={<Trash2 className="size-4" />}
                onClick={() =>
                  void askDelete([{ id: session.id, name: session.name, recordCount: recorded }], () =>
                    navigate(`${basePath}/${meta.path}`, { replace: true }),
                  )
                }
              >
                Hapus sesi
              </Button>
            ) : null}
            <ExportButton kind="session" sessionKind={kind} sessionId={session.id} label="Ekspor Excel" />
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
          emptyDescription="Tambahkan atau pindahkan siswa aktif ke kelas sesi ini dari halaman Siswa."
          selection={can.deleteData ? { ...selection, isSelectable: row => Boolean(row.recordedAt) } : undefined}
          bulkActions={(selectedRows, clear) => (
            <Button variant="danger" size="sm" icon={<Trash2 className="size-3.5" />} onClick={() => askDeleteRecords(selectedRows, clear)}>
              Hapus data
            </Button>
          )}
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

      <RecordFormDrawer
        key={`record-${recordEditor.key}`}
        open={recordEditor.open}
        kind={kind}
        session={session}
        target={recordEditor.target}
        onClose={recordEditor.close}
      />
      <SessionFormDrawer
        key={`session-${sessionEditor.key}`}
        open={sessionEditor.open}
        kind={kind}
        session={session}
        recordCount={recorded}
        onClose={sessionEditor.close}
      />
    </div>
  );
}


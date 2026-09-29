import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Download, Plus } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { useSchoolScope } from '@/scope/SchoolScope';
import {
  useClasses,
  useImmunizationRecords,
  useImmunizationSessions,
  useMeasurementRecords,
  useMeasurementSessions,
  useSchoolMutation,
  useStudents,
} from '@/hooks/useSchoolData';
import { createImmunizationSession, createMeasurementSession } from '@/api/school';
import { errorMessage } from '@/api/errors';
import type { ImmunizationSessionRow, MeasurementSessionRow, SessionStatus } from '@/api/types';
import { formatDate, formatPercent, todayIso } from '@/lib/format';
import { downloadCsv, slugify } from '@/lib/csv';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, FilterSelect, type Column } from '@/components/ui/DataTable';
import { SESSION_STATUS_LABEL, SessionStatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Field, FormError, Input, Select, Textarea } from '@/components/ui/Form';
import { QueryBoundary } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';

export type SessionKind = 'measurement' | 'immunization';

type AnySession = MeasurementSessionRow & Partial<Pick<ImmunizationSessionRow, 'vaccine_name' | 'dose_label' | 'officer_name'>>;
type Row = AnySession & { className: string; total: number; recorded: number };

export const KIND_META: Record<SessionKind, { title: string; path: string; noun: string }> = {
  measurement: { title: 'Sesi Pengukuran', path: 'pengukuran', noun: 'pengukuran' },
  immunization: { title: 'Sesi Imunisasi', path: 'imunisasi', noun: 'imunisasi' },
};

export function useSessionData(kind: SessionKind) {
  const measurementSessions = useMeasurementSessions();
  const immunizationSessions = useImmunizationSessions();
  const measurementRecords = useMeasurementRecords();
  const immunizationRecords = useImmunizationRecords();
  return kind === 'measurement'
    ? { sessions: measurementSessions, records: measurementRecords }
    : { sessions: immunizationSessions, records: immunizationRecords };
}

export function SessionsPage({ kind }: { kind: SessionKind }) {
  const meta = KIND_META[kind];
  const { schoolName, basePath, readOnly } = useSchoolScope();
  const navigate = useNavigate();
  const { sessions, records } = useSessionData(kind);
  const classes = useClasses();
  const students = useStudents();
  const [classFilter, setClassFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [creating, setCreating] = useState(false);

  const rows = useMemo<Row[]>(() => {
    const classNameById = new Map((classes.data ?? []).map(item => [item.id, item.name]));
    const totalByClass = new Map<string, number>();
    for (const student of students.data ?? []) {
      if (student.isActive) totalByClass.set(student.classId, (totalByClass.get(student.classId) ?? 0) + 1);
    }
    const recordedBySession = new Map<string, Set<string>>();
    for (const record of (records.data ?? []) as Array<{ session_id: string; student_id: string }>) {
      const set = recordedBySession.get(record.session_id) ?? new Set<string>();
      set.add(record.student_id);
      recordedBySession.set(record.session_id, set);
    }
    return ((sessions.data ?? []) as AnySession[]).map(item => ({
      ...item,
      className: classNameById.get(item.class_id) ?? 'Kelas tidak diketahui',
      total: totalByClass.get(item.class_id) ?? 0,
      recorded: recordedBySession.get(item.id)?.size ?? 0,
    }));
  }, [sessions.data, records.data, classes.data, students.data]);

  const filtered = rows.filter(
    row => (!classFilter || row.class_id === classFilter) && (!statusFilter || row.status === statusFilter),
  );

  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: 'Sesi',
      sortValue: row => row.name,
      cell: row => (
        <div className="min-w-0">
          <p className="font-medium text-fg">{row.name}</p>
          {kind === 'immunization' ? (
            <p className="text-xs text-fg-subtle">
              {row.vaccine_name}
              {row.dose_label ? ` · ${row.dose_label}` : ''}
            </p>
          ) : row.note ? (
            <p className="max-w-xs truncate text-xs text-fg-subtle">{row.note}</p>
          ) : null}
        </div>
      ),
    },
    { key: 'date', header: 'Tanggal', sortValue: row => row.session_date, cell: row => formatDate(row.session_date) },
    { key: 'class', header: 'Kelas', sortValue: row => row.className, cell: row => row.className },
    {
      key: 'progress',
      header: 'Progres',
      sortValue: row => (row.total > 0 ? row.recorded / row.total : 0),
      cell: row => {
        const ratio = row.total > 0 ? Math.min(1, row.recorded / row.total) : 0;
        return (
          <div className="w-36">
            <div className="flex justify-between text-xs text-fg-subtle">
              <span className="tabular-nums">
                {row.recorded}/{row.total}
              </span>
              <span>{formatPercent(row.total > 0 ? ratio : null)}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-card-muted">
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${ratio * 100}%` }} />
            </div>
          </div>
        );
      },
    },
    ...(kind === 'immunization'
      ? [{ key: 'officer', header: 'Petugas', cell: (row: Row) => row.officer_name ?? '-' }]
      : []),
    { key: 'status', header: 'Status', sortValue: row => row.status, cell: row => <SessionStatusBadge status={row.status} /> },
  ];

  const exportCsv = () =>
    downloadCsv(`sesi-${meta.path}-${slugify(schoolName)}`, filtered, [
      { header: 'Nama Sesi', value: row => row.name },
      { header: 'Tanggal', value: row => row.session_date },
      { header: 'Kelas', value: row => row.className },
      ...(kind === 'immunization'
        ? [
            { header: 'Vaksin', value: (row: Row) => row.vaccine_name },
            { header: 'Dosis', value: (row: Row) => row.dose_label },
            { header: 'Petugas', value: (row: Row) => row.officer_name },
          ]
        : []),
      { header: 'Siswa Tercatat', value: row => row.recorded },
      { header: 'Total Siswa Kelas', value: row => row.total },
      { header: 'Status', value: row => SESSION_STATUS_LABEL[row.status] ?? row.status },
      { header: 'Catatan', value: row => row.note },
    ]);

  return (
    <div>
      <PageHeader
        title={meta.title}
        description={
          kind === 'measurement'
            ? 'Sesi pengukuran tinggi & berat badan per kelas.'
            : 'Sesi imunisasi per kelas beserta status pemberian vaksin.'
        }
        actions={
          readOnly ? null : (
            <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              Buat sesi
            </Button>
          )
        }
      />
      <Card>
        <QueryBoundary
          isLoading={sessions.isLoading || classes.isLoading}
          error={sessions.error ?? classes.error ?? records.error}
          onRetry={() => {
            void sessions.refetch();
            void records.refetch();
            void classes.refetch();
          }}
        >
          {() => (
            <DataTable
              rows={filtered}
              columns={columns}
              getRowId={row => row.id}
              getSearchText={row => `${row.name} ${row.className} ${row.vaccine_name ?? ''} ${row.officer_name ?? ''}`}
              searchPlaceholder="Cari sesi / kelas"
              onRowClick={row => navigate(`${basePath}/${meta.path}/${row.id}`)}
              initialSort={{ key: 'date', dir: 'desc' }}
              emptyTitle={`Belum ada sesi ${meta.noun}`}
              filters={
                <>
                  <FilterSelect
                    label="Kelas"
                    value={classFilter}
                    onChange={setClassFilter}
                    options={[{ value: '', label: 'Semua kelas' }, ...(classes.data ?? []).map(item => ({ value: item.id, label: item.name }))]}
                  />
                  <FilterSelect
                    label="Status"
                    value={statusFilter}
                    onChange={setStatusFilter}
                    options={[
                      { value: '', label: 'Semua status' },
                      ...(Object.keys(SESSION_STATUS_LABEL) as SessionStatus[]).map(value => ({
                        value,
                        label: SESSION_STATUS_LABEL[value],
                      })),
                    ]}
                  />
                </>
              }
              actions={
                <Button variant="secondary" size="sm" icon={<Download className="size-3.5" />} onClick={exportCsv}>
                  Ekspor CSV
                </Button>
              }
            />
          )}
        </QueryBoundary>
      </Card>
      {creating ? (
        <CreateSessionModal
          kind={kind}
          onClose={() => setCreating(false)}
          onCreated={id => navigate(`${basePath}/${meta.path}/${id}`)}
        />
      ) : null}
    </div>
  );
}

function CreateSessionModal({
  kind,
  onClose,
  onCreated,
}: {
  kind: SessionKind;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { schoolId } = useSchoolScope();
  const { userId } = useAuth();
  const toast = useToast();
  const classes = useClasses();
  const [form, setForm] = useState({
    name: '',
    classId: '',
    sessionDate: todayIso(),
    note: '',
    vaccineName: '',
    doseLabel: '',
    officerName: '',
  });
  const [error, setError] = useState<string | null>(null);
  const mutation = useSchoolMutation(async (input: typeof form, role) => {
    if (!userId) throw new Error('Data user tidak ditemukan. Silakan login ulang.');
    const base = { schoolId, classId: input.classId, name: input.name, note: input.note, sessionDate: input.sessionDate, createdBy: userId };
    return kind === 'measurement'
      ? createMeasurementSession(base, role)
      : createImmunizationSession(
          { ...base, vaccineName: input.vaccineName, doseLabel: input.doseLabel, officerName: input.officerName },
          role,
        );
  });

  const set = (key: keyof typeof form, value: string) => setForm(current => ({ ...current, [key]: value }));

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!form.name.trim()) return setError('Nama sesi wajib diisi.');
    if (!form.classId) return setError('Pilih kelas.');
    if (!form.sessionDate) return setError('Tanggal sesi wajib diisi.');
    if (kind === 'immunization' && !form.vaccineName.trim()) return setError('Jenis imunisasi wajib diisi.');
    try {
      const id = await mutation.mutateAsync(form);
      toast.success('Sesi dibuat.');
      onClose();
      onCreated(id);
    } catch (submitError) {
      setError(errorMessage(submitError));
    }
  };

  return (
    <Modal
      open
      size="lg"
      title={kind === 'measurement' ? 'Buat sesi pengukuran' : 'Buat sesi imunisasi'}
      description="Sesi langsung berstatus aktif dan dapat diisi dari dashboard ini atau aplikasi mobile."
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Batal
          </Button>
          <Button type="submit" form="session-form" loading={mutation.isPending}>
            Buat sesi
          </Button>
        </>
      }
    >
      <form id="session-form" onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <FormError message={error} />
        </div>
        <Field label="Nama sesi *" className="sm:col-span-2">
          {id => (
            <Input
              id={id}
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder={kind === 'measurement' ? 'mis. Pengukuran Semester 1' : 'mis. BIAS Campak Rubella'}
            />
          )}
        </Field>
        <Field label="Kelas *">
          {id => (
            <Select id={id} value={form.classId} onChange={e => set('classId', e.target.value)}>
              <option value="">Pilih kelas</option>
              {(classes.data ?? []).map(item => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Tanggal *">
          {id => <Input id={id} type="date" value={form.sessionDate} onChange={e => set('sessionDate', e.target.value)} />}
        </Field>
        {kind === 'immunization' ? (
          <>
            <Field label="Jenis imunisasi / vaksin *">
              {id => <Input id={id} value={form.vaccineName} onChange={e => set('vaccineName', e.target.value)} placeholder="mis. MR, DT, Td, HPV" />}
            </Field>
            <Field label="Dosis">
              {id => <Input id={id} value={form.doseLabel} onChange={e => set('doseLabel', e.target.value)} placeholder="mis. Dosis 1" />}
            </Field>
            <Field label="Petugas" className="sm:col-span-2">
              {id => <Input id={id} value={form.officerName} onChange={e => set('officerName', e.target.value)} />}
            </Field>
          </>
        ) : null}
        <Field label="Catatan" className="sm:col-span-2">
          {id => <Textarea id={id} value={form.note} onChange={e => set('note', e.target.value)} />}
        </Field>
      </form>
    </Modal>
  );
}

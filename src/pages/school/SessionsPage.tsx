import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { CheckCircle2, Download, ExternalLink, Pencil, PlayCircle, Plus, Trash2, XCircle } from 'lucide-react';
import { useSchoolScope } from '@/scope/SchoolScope';
import {
  useClasses,
  useImmunizationRecords,
  useImmunizationSessions,
  useMeasurementRecords,
  useMeasurementSessions,
  useStudents,
} from '@/hooks/useSchoolData';
import { useDrawerState, useSelection } from '@/hooks/useCrud';
import type { SessionStatus } from '@/api/types';
import { formatDate, formatPercent } from '@/lib/format';
import { downloadCsv, slugify } from '@/lib/csv';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, FilterSelect, type Column } from '@/components/ui/DataTable';
import { SESSION_STATUS_LABEL, SessionStatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { QueryBoundary } from '@/components/ui/States';
import { RowActions } from '@/components/ui/RowActions';
import { SessionFormDrawer, type AnySession } from './sessions/SessionFormDrawer';
import { useSessionActions } from './sessions/useSessionActions';
import { ExportButton } from '@/components/importExport/ExportButton';

export type SessionKind = 'measurement' | 'immunization';

type Row = AnySession & { className: string; total: number; recorded: number; recordCount: number };

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
  const { schoolName, basePath, can } = useSchoolScope();
  const navigate = useNavigate();
  const { sessions, records } = useSessionData(kind);
  const classes = useClasses();
  const students = useStudents();
  const [classFilter, setClassFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const editor = useDrawerState<Row | 'new'>();
  const selection = useSelection();
  const { askStatus, askDelete } = useSessionActions(kind);
  const canBulk = can.manageSessions || can.deleteData;

  const rows = useMemo<Row[]>(() => {
    const classNameById = new Map((classes.data ?? []).map(item => [item.id, item.name]));
    const totalByClass = new Map<string, number>();
    for (const student of students.data ?? []) {
      if (student.isActive) totalByClass.set(student.classId, (totalByClass.get(student.classId) ?? 0) + 1);
    }
    const recordedBySession = new Map<string, Set<string>>();
    const countBySession = new Map<string, number>();
    for (const record of (records.data ?? []) as Array<{ session_id: string; student_id: string }>) {
      const set = recordedBySession.get(record.session_id) ?? new Set<string>();
      set.add(record.student_id);
      recordedBySession.set(record.session_id, set);
      countBySession.set(record.session_id, (countBySession.get(record.session_id) ?? 0) + 1);
    }
    return ((sessions.data ?? []) as AnySession[]).map(item => ({
      ...item,
      className: classNameById.get(item.class_id) ?? 'Kelas tidak diketahui',
      total: totalByClass.get(item.class_id) ?? 0,
      recorded: recordedBySession.get(item.id)?.size ?? 0,
      recordCount: countBySession.get(item.id) ?? 0,
    }));
  }, [sessions.data, records.data, classes.data, students.data]);

  const filtered = useMemo(
    () => rows.filter(row => (!classFilter || row.class_id === classFilter) && (!statusFilter || row.status === statusFilter)),
    [rows, classFilter, statusFilter],
  );
  const openSession = (row: Row) => navigate(`${basePath}/${meta.path}/${row.id}`);

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
    {
      key: 'actions',
      header: '',
      className: 'w-12 text-right',
      cell: (row: Row) => {
        const open = row.status === 'active' || row.status === 'draft';
        return (
          <RowActions
            actions={[
              { label: 'Buka sesi', icon: <ExternalLink className="size-4" />, onSelect: () => openSession(row) },
              { label: 'Ubah', icon: <Pencil className="size-4" />, hidden: !can.manageSessions, onSelect: () => editor.show(row) },
              {
                label: 'Tandai selesai',
                icon: <CheckCircle2 className="size-4" />,
                hidden: !can.manageSessions || !open,
                onSelect: () => void askStatus([row], 'completed'),
              },
              {
                label: 'Aktifkan kembali',
                icon: <PlayCircle className="size-4" />,
                hidden: !can.manageSessions || open,
                onSelect: () => void askStatus([row], 'active'),
              },
              {
                label: 'Batalkan sesi',
                icon: <XCircle className="size-4" />,
                hidden: !can.manageSessions || !open,
                onSelect: () => void askStatus([row], 'cancelled'),
              },
              {
                label: 'Hapus',
                icon: <Trash2 className="size-4" />,
                tone: 'danger',
                hidden: !can.deleteData,
                onSelect: () => void askDelete([row]),
              },
            ]}
          />
        );
      },
    },
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
          !can.createSessions ? null : (
            <Button icon={<Plus className="size-4" />} onClick={() => editor.show('new')}>
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
              onRowClick={openSession}
              initialSort={{ key: 'date', dir: 'desc' }}
              emptyTitle={`Belum ada sesi ${meta.noun}`}
              emptyDescription={can.createSessions ? 'Buat sesi untuk mulai mencatat data per kelas.' : undefined}
              emptyAction={
                can.createSessions ? (
                  <Button icon={<Plus className="size-4" />} onClick={() => editor.show('new')}>
                    Buat sesi
                  </Button>
                ) : undefined
              }
              selection={canBulk ? selection : undefined}
              bulkActions={(selectedRows, clear) => (
                <>
                  {can.manageSessions ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<CheckCircle2 className="size-3.5" />}
                      onClick={() => void askStatus(selectedRows, 'completed', clear)}
                    >
                      Tandai selesai
                    </Button>
                  ) : null}
                  {can.deleteData ? (
                    <Button variant="danger" size="sm" icon={<Trash2 className="size-3.5" />} onClick={() => void askDelete(selectedRows, clear)}>
                      Hapus
                    </Button>
                  ) : null}
                </>
              )}
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
                <>
                  <ExportButton kind="recap" />
                  <Button variant="secondary" size="sm" icon={<Download className="size-3.5" />} onClick={exportCsv}>
                    Ekspor CSV
                  </Button>
                </>
              }
            />
          )}
        </QueryBoundary>
      </Card>
      <SessionFormDrawer
        key={editor.key}
        open={editor.open}
        kind={kind}
        session={editor.target === 'new' ? null : editor.target}
        recordCount={editor.target && editor.target !== 'new' ? editor.target.recordCount : 0}
        onClose={editor.close}
        onCreated={id => navigate(`${basePath}/${meta.path}/${id}`)}
      />
    </div>
  );
}


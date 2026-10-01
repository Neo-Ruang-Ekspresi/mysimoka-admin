import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Download, Pencil, Plus } from 'lucide-react';
import { useSchoolScope } from '@/scope/SchoolScope';
import {
  useAcademicYears,
  useClasses,
  useGradeLevels,
  useImmunizationRecords,
  useMeasurementRecords,
  useMeasurementSessions,
  useSchoolMutation,
  useStudents,
} from '@/hooks/useSchoolData';
import { createClass, updateClass } from '@/api/school';
import { errorMessage } from '@/api/errors';
import type { ClassRow } from '@/api/types';
import { formatDate, formatPercent } from '@/lib/format';
import { downloadCsv, slugify } from '@/lib/csv';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, FilterSelect, type Column } from '@/components/ui/DataTable';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Field, FormError, Input, Select } from '@/components/ui/Form';
import { QueryBoundary } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';

type Row = ClassRow & {
  students: number;
  measured: number;
  immunized: number;
  lastSession: string | null;
};

export function ClassesPage() {
  const { schoolName, can, basePath } = useSchoolScope();
  const canEdit = can.manageClasses;
  const navigate = useNavigate();
  const classes = useClasses();
  const students = useStudents();
  const mSessions = useMeasurementSessions();
  const mRecords = useMeasurementRecords();
  const iRecords = useImmunizationRecords();
  const years = useAcademicYears();
  const [yearFilter, setYearFilter] = useState('');
  const [editing, setEditing] = useState<ClassRow | 'new' | null>(null);

  const rows = useMemo<Row[]>(() => {
    const active = (students.data ?? []).filter(item => item.isActive);
    const measuredIds = new Set((mRecords.data ?? []).map(item => item.student_id));
    const immunizedIds = new Set((iRecords.data ?? []).filter(item => item.status === 'given').map(item => item.student_id));
    return (classes.data ?? []).map(classRow => {
      const ids = active.filter(item => item.classId === classRow.id).map(item => item.id);
      const lastSession = (mSessions.data ?? []).find(item => item.class_id === classRow.id)?.session_date ?? null;
      return {
        ...classRow,
        students: ids.length,
        measured: ids.filter(id => measuredIds.has(id)).length,
        immunized: ids.filter(id => immunizedIds.has(id)).length,
        lastSession,
      };
    });
  }, [classes.data, students.data, mRecords.data, iRecords.data, mSessions.data]);

  const filtered = rows.filter(row => !yearFilter || row.academic_year_id === yearFilter);
  const pct = (part: number, total: number) => (total > 0 ? part / total : null);

  const columns: Column<Row>[] = [
    { key: 'name', header: 'Kelas', sortValue: row => row.name, cell: row => <span className="font-medium">{row.name}</span> },
    {
      key: 'grade',
      header: 'Tingkat',
      sortValue: row => row.grade_level?.level_number ?? null,
      cell: row => row.grade_level?.label ?? '-',
    },
    { key: 'year', header: 'Tahun ajaran', cell: row => row.academic_year?.label ?? '-' },
    { key: 'students', header: 'Siswa aktif', sortValue: row => row.students, cell: row => row.students },
    {
      key: 'measured',
      header: 'Terukur',
      sortValue: row => pct(row.measured, row.students),
      cell: row => `${row.measured} (${formatPercent(pct(row.measured, row.students))})`,
    },
    {
      key: 'immunized',
      header: 'Terimunisasi',
      sortValue: row => pct(row.immunized, row.students),
      cell: row => `${row.immunized} (${formatPercent(pct(row.immunized, row.students))})`,
    },
    { key: 'last', header: 'Sesi ukur terakhir', sortValue: row => row.lastSession, cell: row => formatDate(row.lastSession) },
    ...(!canEdit
      ? []
      : [
          {
            key: 'actions',
            header: '',
            className: 'text-right',
            cell: (row: Row) => (
              <Button
                variant="ghost"
                size="sm"
                icon={<Pencil className="size-3.5" />}
                onClick={event => {
                  event.stopPropagation();
                  setEditing(row);
                }}
              >
                Ubah
              </Button>
            ),
          },
        ]),
  ];

  const exportCsv = () =>
    downloadCsv(`kelas-${slugify(schoolName)}`, filtered, [
      { header: 'Kelas', value: row => row.name },
      { header: 'Tingkat', value: row => row.grade_level?.label },
      { header: 'Tahun Ajaran', value: row => row.academic_year?.label },
      { header: 'Siswa Aktif', value: row => row.students },
      { header: 'Siswa Terukur', value: row => row.measured },
      { header: 'Siswa Terimunisasi', value: row => row.immunized },
      { header: 'Sesi Ukur Terakhir', value: row => row.lastSession },
    ]);

  return (
    <div>
      <PageHeader
        title="Kelas"
        description="Daftar kelas beserta cakupan pengukuran & imunisasi. Klik baris untuk melihat siswa."
        actions={
          !canEdit ? null : (
            <Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
              Tambah kelas
            </Button>
          )
        }
      />
      <Card>
        <QueryBoundary
          isLoading={classes.isLoading || students.isLoading}
          error={classes.error ?? students.error}
          onRetry={() => {
            void classes.refetch();
            void students.refetch();
          }}
        >
          {() => (
            <DataTable
              rows={filtered}
              columns={columns}
              getRowId={row => row.id}
              getSearchText={row => `${row.name} ${row.grade_level?.label ?? ''}`}
              searchPlaceholder="Cari kelas"
              onRowClick={row => navigate(`${basePath}/siswa?kelas=${row.id}`)}
              initialSort={{ key: 'name', dir: 'asc' }}
              emptyTitle="Belum ada kelas"
              filters={
                <FilterSelect
                  label="Tahun ajaran"
                  value={yearFilter}
                  onChange={setYearFilter}
                  options={[
                    { value: '', label: 'Semua tahun ajaran' },
                    ...(years.data ?? []).map(item => ({ value: item.id, label: item.label ?? '-' })),
                  ]}
                />
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
      {editing ? <ClassFormModal classRow={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function ClassFormModal({ classRow, onClose }: { classRow: ClassRow | null; onClose: () => void }) {
  const { schoolId } = useSchoolScope();
  const toast = useToast();
  const grades = useGradeLevels();
  const years = useAcademicYears();
  const [name, setName] = useState(classRow?.name ?? '');
  const [gradeLevelId, setGradeLevelId] = useState(classRow?.grade_level_id ?? '');
  // Mobile memakai tahun ajaran "aktif" = urutan pertama (start_year desc).
  const [academicYearId, setAcademicYearId] = useState(classRow?.academic_year_id ?? '');
  const [error, setError] = useState<string | null>(null);
  const effectiveYearId = academicYearId || years.data?.[0]?.id || '';

  const mutation = useSchoolMutation(async (_: void, role) => {
    if (classRow) await updateClass({ classId: classRow.id, name, gradeLevelId }, role);
    else await createClass({ schoolId, academicYearId: effectiveYearId, gradeLevelId, name }, role);
  });

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!name.trim()) return setError('Nama kelas wajib diisi.');
    if (!gradeLevelId) return setError('Pilih tingkat kelas.');
    if (!classRow && !effectiveYearId) return setError('Tambahkan tahun ajaran terlebih dahulu.');
    try {
      await mutation.mutateAsync();
      toast.success(classRow ? 'Kelas diperbarui.' : 'Kelas baru ditambahkan.');
      onClose();
    } catch (submitError) {
      setError(errorMessage(submitError));
    }
  };

  return (
    <Modal
      open
      title={classRow ? 'Ubah kelas' : 'Tambah kelas'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Batal
          </Button>
          <Button type="submit" form="class-form" loading={mutation.isPending}>
            Simpan
          </Button>
        </>
      }
    >
      <form id="class-form" onSubmit={onSubmit} className="flex flex-col gap-4">
        <FormError message={error ?? (grades.error ? errorMessage(grades.error) : null)} />
        <Field label="Nama kelas *">
          {id => <Input id={id} value={name} onChange={e => setName(e.target.value)} placeholder="mis. Kelas 3A" />}
        </Field>
        <Field label="Tingkat *">
          {id => (
            <Select id={id} value={gradeLevelId} onChange={e => setGradeLevelId(e.target.value)}>
              <option value="">{grades.isLoading ? 'Memuat…' : 'Pilih tingkat'}</option>
              {(grades.data ?? []).map(item => (
                <option key={item.id} value={item.id}>
                  {item.label ?? `Kelas ${item.level_number}`}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          label="Tahun ajaran"
          hint={classRow ? 'Tahun ajaran kelas tidak dapat diubah (permission Hasura hanya name & grade_level_id).' : undefined}
        >
          {id => (
            <Select id={id} value={effectiveYearId} onChange={e => setAcademicYearId(e.target.value)} disabled={Boolean(classRow)}>
              {(years.data ?? []).length === 0 ? <option value="">Belum ada tahun ajaran</option> : null}
              {(years.data ?? []).map(item => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </form>
    </Modal>
  );
}

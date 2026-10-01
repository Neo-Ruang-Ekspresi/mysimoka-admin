import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Download, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { useSchoolScope } from '@/scope/SchoolScope';
import {
  useAcademicYears,
  useClasses,
  useEnrollments,
  useGradeLevels,
  useImmunizationRecords,
  useImmunizationSessions,
  useMeasurementRecords,
  useMeasurementSessions,
  useSchoolMutation,
  useStudents,
} from '@/hooks/useSchoolData';
import { createClass, deleteClass, updateClass } from '@/api/crud/classes';
import { errorMessage } from '@/api/errors';
import type { ClassRow } from '@/api/types';
import { formatDate, formatPercent } from '@/lib/format';
import { downloadCsv, slugify } from '@/lib/csv';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, FilterSelect, type Column } from '@/components/ui/DataTable';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Field, FormError, Input, Select } from '@/components/ui/Form';
import { QueryBoundary } from '@/components/ui/States';
import { RowActions } from '@/components/ui/RowActions';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useDrawerState } from '@/hooks/useCrud';
import { useToast } from '@/components/ui/Toast';

type Row = ClassRow & {
  students: number;
  enrollments: number;
  sessions: number;
  measured: number;
  immunized: number;
  lastSession: string | null;
};

export function ClassesPage() {
  const { schoolName, can, basePath } = useSchoolScope();
  const canEdit = can.manageClasses;
  const canDelete = can.manageClasses && can.deleteData;
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const classes = useClasses();
  const students = useStudents();
  const enrollments = useEnrollments();
  const mSessions = useMeasurementSessions();
  const iSessions = useImmunizationSessions();
  const mRecords = useMeasurementRecords();
  const iRecords = useImmunizationRecords();
  const years = useAcademicYears();
  const grades = useGradeLevels();
  const [yearFilter, setYearFilter] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const editor = useDrawerState<ClassRow | 'new'>();
  const remove = useSchoolMutation((id: string, role) => deleteClass(id, role));

  const rows = useMemo<Row[]>(() => {
    const active = (students.data ?? []).filter(item => item.isActive);
    const measuredIds = new Set((mRecords.data ?? []).map(item => item.student_id));
    const immunizedIds = new Set((iRecords.data ?? []).filter(item => item.status === 'given').map(item => item.student_id));
    const allSessions = [...(mSessions.data ?? []), ...(iSessions.data ?? [])];
    return (classes.data ?? []).map(classRow => {
      const ids = active.filter(item => item.classId === classRow.id).map(item => item.id);
      const lastSession = (mSessions.data ?? []).find(item => item.class_id === classRow.id)?.session_date ?? null;
      return {
        ...classRow,
        students: ids.length,
        enrollments: (enrollments.data ?? []).filter(item => item.class_id === classRow.id).length,
        sessions: allSessions.filter(item => item.class_id === classRow.id).length,
        measured: ids.filter(id => measuredIds.has(id)).length,
        immunized: ids.filter(id => immunizedIds.has(id)).length,
        lastSession,
      };
    });
  }, [classes.data, students.data, enrollments.data, mRecords.data, iRecords.data, mSessions.data, iSessions.data]);

  const filtered = useMemo(
    () =>
      rows.filter(
        row => (!yearFilter || row.academic_year_id === yearFilter) && (!gradeFilter || row.grade_level_id === gradeFilter),
      ),
    [rows, yearFilter, gradeFilter],
  );
  const pct = (part: number, total: number) => (total > 0 ? part / total : null);

  const askDelete = (row: Row) => {
    const blocked = row.enrollments > 0 || row.sessions > 0;
    void confirm({
      title: `Hapus kelas ${row.name}?`,
      tone: 'danger',
      confirmLabel: 'Hapus kelas',
      message: blocked ? (
        <>
          Kelas ini masih punya <b>{row.enrollments} riwayat siswa</b> dan <b>{row.sessions} sesi</b>. Penghapusan akan
          ditolak server — pindahkan siswa / hapus sesinya dulu.
        </>
      ) : (
        'Kelas akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.'
      ),
      onConfirm: async () => {
        await remove.mutateAsync(row.id);
        toast.success(`Kelas ${row.name} dihapus.`);
      },
    });
  };

  const columns: Column<Row>[] = [
    { key: 'name', header: 'Kelas', sortValue: row => row.name, cell: row => <span className="font-medium">{row.name}</span> },
    {
      key: 'grade',
      header: 'Tingkat',
      sortValue: row => row.grade_level?.level_number ?? null,
      cell: row => row.grade_level?.label ?? '-',
    },
    { key: 'year', header: 'Tahun ajaran', sortValue: row => row.academic_year?.start_year, cell: row => row.academic_year?.label ?? '-' },
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
    {
      key: 'actions',
      header: '',
      className: 'w-12 text-right',
      cell: (row: Row) => (
        <RowActions
          actions={[
            { label: 'Lihat siswa', icon: <Users className="size-4" />, onSelect: () => navigate(`${basePath}/siswa?kelas=${row.id}`) },
            { label: 'Ubah', icon: <Pencil className="size-4" />, onSelect: () => editor.show(row), hidden: !canEdit },
            {
              label: 'Hapus',
              icon: <Trash2 className="size-4" />,
              tone: 'danger',
              onSelect: () => askDelete(row),
              hidden: !canDelete,
            },
          ]}
        />
      ),
    },
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

  const addButton = !canEdit ? null : (
    <Button icon={<Plus className="size-4" />} onClick={() => editor.show('new')}>
      Tambah kelas
    </Button>
  );

  return (
    <div>
      <PageHeader
        title="Kelas"
        description="Daftar kelas beserta cakupan pengukuran & imunisasi. Klik baris untuk melihat siswa."
        actions={addButton}
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
              getSearchText={row => `${row.name} ${row.grade_level?.label ?? ''} ${row.academic_year?.label ?? ''}`}
              searchPlaceholder="Cari kelas"
              onRowClick={row => navigate(`${basePath}/siswa?kelas=${row.id}`)}
              initialSort={{ key: 'name', dir: 'asc' }}
              emptyTitle="Belum ada kelas"
              emptyDescription={canEdit ? 'Buat kelas pertama agar siswa dapat didaftarkan.' : undefined}
              emptyAction={addButton}
              filters={
                <>
                  <FilterSelect
                    label="Tahun ajaran"
                    value={yearFilter}
                    onChange={setYearFilter}
                    options={[
                      { value: '', label: 'Semua tahun ajaran' },
                      ...(years.data ?? []).map(item => ({ value: item.id, label: item.label ?? '-' })),
                    ]}
                  />
                  <FilterSelect
                    label="Tingkat"
                    value={gradeFilter}
                    onChange={setGradeFilter}
                    options={[
                      { value: '', label: 'Semua tingkat' },
                      ...(grades.data ?? []).map(item => ({ value: item.id, label: item.label ?? `Kelas ${item.level_number}` })),
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
      <ClassFormDrawer
        key={editor.key}
        open={editor.open}
        classRow={editor.target === 'new' ? null : editor.target}
        onClose={editor.close}
      />
    </div>
  );
}

function ClassFormDrawer({ open, classRow, onClose }: { open: boolean; classRow: ClassRow | null; onClose: () => void }) {
  const { schoolId } = useSchoolScope();
  const toast = useToast();
  const grades = useGradeLevels();
  const years = useAcademicYears();
  const classes = useClasses();
  const [name, setName] = useState(classRow?.name ?? '');
  const [gradeLevelId, setGradeLevelId] = useState(classRow?.grade_level_id ?? '');
  // Mobile memakai tahun ajaran "aktif" = urutan pertama (start_year desc).
  const [academicYearId, setAcademicYearId] = useState(classRow?.academic_year_id ?? '');
  const [errors, setErrors] = useState<{ name?: string; grade?: string; year?: string; form?: string }>({});
  const effectiveYearId = academicYearId || years.data?.[0]?.id || '';

  const mutation = useSchoolMutation(async (_: void, role) => {
    if (classRow) await updateClass({ classId: classRow.id, name, gradeLevelId }, role);
    else await createClass({ schoolId, academicYearId: effectiveYearId, gradeLevelId, name }, role);
  });

  const onSubmit = async () => {
    const next: typeof errors = {};
    const trimmed = name.trim();
    if (!trimmed) next.name = 'Nama kelas wajib diisi.';
    else if (trimmed.length > 60) next.name = 'Nama kelas maksimal 60 karakter.';
    else if (
      (classes.data ?? []).some(
        item =>
          item.id !== classRow?.id &&
          item.name.trim().toLowerCase() === trimmed.toLowerCase() &&
          item.academic_year_id === (classRow?.academic_year_id ?? effectiveYearId),
      )
    ) {
      next.name = 'Nama kelas sudah dipakai di tahun ajaran ini.';
    }
    if (!gradeLevelId) next.grade = 'Pilih tingkat kelas.';
    if (!classRow && !effectiveYearId) next.year = 'Tambahkan tahun ajaran terlebih dahulu.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    try {
      await mutation.mutateAsync();
      toast.success(classRow ? 'Kelas diperbarui.' : 'Kelas baru ditambahkan.');
      onClose();
    } catch (submitError) {
      setErrors({ form: errorMessage(submitError) });
    }
  };

  return (
    <Drawer
      open={open}
      title={classRow ? 'Ubah kelas' : 'Tambah kelas'}
      description={classRow ? classRow.name : 'Kelas baru untuk tahun ajaran terpilih.'}
      onClose={onClose}
      onSubmit={() => void onSubmit()}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Batal
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Simpan
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormError message={errors.form ?? (grades.error ? errorMessage(grades.error) : null)} />
        <Field label="Nama kelas *" error={errors.name}>
          {id => <Input id={id} value={name} onChange={e => setName(e.target.value)} placeholder="mis. Kelas 3A" aria-invalid={Boolean(errors.name)} />}
        </Field>
        <Field label="Tingkat *" error={errors.grade}>
          {id => (
            <Select id={id} value={gradeLevelId} onChange={e => setGradeLevelId(e.target.value)} aria-invalid={Boolean(errors.grade)}>
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
          error={errors.year}
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
      </div>
    </Drawer>
  );
}

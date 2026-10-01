import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ArrowRightLeft, ArrowUpCircle, Download, Eye, PauseCircle, Pencil, PlayCircle, Plus } from 'lucide-react';
import { useSchoolScope } from '@/scope/SchoolScope';
import { useClasses, useImmunizationRecords, useMeasurementRecords, useSchoolMutation, useStudents } from '@/hooks/useSchoolData';
import { useDrawerState, useSelection } from '@/hooks/useCrud';
import { setStudentsActive, updateEnrollment } from '@/api/crud/students';
import { latestMeasurementByStudent, type MeasurementView, type StudentView } from '@/lib/analytics';
import { ageInYears, formatDate, formatDecimal, genderLabel } from '@/lib/format';
import { downloadCsv, slugify } from '@/lib/csv';
import { NUTRITION_CATEGORIES, NUTRITION_COLORS } from '@/lib/nutrition';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, FilterSelect, type Column } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { QueryBoundary } from '@/components/ui/States';
import { RowActions } from '@/components/ui/RowActions';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { StudentFormDrawer } from './students/StudentFormDrawer';
import { StudentDetailDrawer } from './students/StudentDetailDrawer';
import { MoveClassDrawer, type MoveMode } from './students/MoveClassDrawer';
import { ExportButton } from '@/components/importExport/ExportButton';
import { ImportStudentsButton } from '@/components/importExport/ImportStudentsButton';

type Row = StudentView & { latest: MeasurementView | null; immunizationCount: number };

export function StudentsPage() {
  const { schoolName, can } = useSchoolScope();
  const canEdit = can.manageStudents;
  const students = useStudents();
  const classes = useClasses();
  const mRecords = useMeasurementRecords();
  const iRecords = useImmunizationRecords();
  const [params, setParams] = useSearchParams();
  const classFilter = params.get('kelas') ?? '';
  const [gender, setGender] = useState('');
  const [nutrition, setNutrition] = useState('');
  const [status, setStatus] = useState('active');
  const toast = useToast();
  const confirm = useConfirm();
  const editor = useDrawerState<StudentView | 'new'>();
  const viewer = useDrawerState<StudentView>();
  const mover = useDrawerState<{ mode: MoveMode; students: StudentView[] }>();
  const selection = useSelection();
  const setActive = useSchoolMutation(async (input: { rows: StudentView[]; active: boolean }, role) => {
    await setStudentsActive(input.rows.map(item => item.id), input.active, role);
    // Aktifkan kembali: enrollment yang tidak aktif ikut diaktifkan agar siswa kembali ke roster.
    if (input.active) {
      for (const item of input.rows) {
        if (item.enrollmentStatus && item.enrollmentStatus !== 'active') {
          await updateEnrollment(item.enrollmentId, { status: 'active' }, role);
        }
      }
    }
  });

  const rows = useMemo<Row[]>(() => {
    const latest = latestMeasurementByStudent(mRecords.data ?? []);
    const immunizations = new Map<string, number>();
    for (const record of iRecords.data ?? []) {
      if (record.status === 'given') immunizations.set(record.student_id, (immunizations.get(record.student_id) ?? 0) + 1);
    }
    return (students.data ?? []).map(item => ({
      ...item,
      latest: latest.get(item.id) ?? null,
      immunizationCount: immunizations.get(item.id) ?? 0,
    }));
  }, [students.data, mRecords.data, iRecords.data]);

  const filtered = useMemo(
    () =>
      rows.filter(row => {
        if (classFilter && row.classId !== classFilter) return false;
        if (gender && row.student.gender !== gender) return false;
        if (status === 'active' && !row.isActive) return false;
        if (status === 'inactive' && row.isActive) return false;
        if (nutrition === 'none' && row.latest?.category) return false;
        if (nutrition && nutrition !== 'none' && row.latest?.category !== nutrition) return false;
        return true;
      }),
    [rows, classFilter, gender, status, nutrition],
  );

  const askSetActive = (targets: StudentView[], active: boolean, onDone?: () => void) => {
    const single = targets.length === 1 ? targets[0].student.full_name : `${targets.length} siswa`;
    void confirm({
      title: active ? `Aktifkan kembali ${single}?` : `Nonaktifkan ${single}?`,
      tone: active ? 'primary' : 'danger',
      confirmLabel: active ? 'Aktifkan' : 'Nonaktifkan',
      message: active
        ? 'Siswa akan kembali muncul di roster kelasnya dan dihitung di statistik.'
        : 'Siswa tidak lagi muncul di roster sesi dan statistik siswa aktif. Riwayat pengukuran & imunisasi tetap tersimpan, dan siswa bisa diaktifkan kembali (filter "Nonaktif").',
      onConfirm: async () => {
        await setActive.mutateAsync({ rows: targets, active });
        toast.success(active ? `${single} diaktifkan kembali.` : `${single} dinonaktifkan.`);
        onDone?.();
      },
    });
  };

  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: 'Nama',
      sortValue: row => row.student.full_name,
      cell: row => (
        <div className="min-w-0">
          <p className="font-medium text-fg">{row.student.full_name}</p>
          <p className="text-xs text-fg-subtle">NISN {row.student.student_number ?? '-'}</p>
        </div>
      ),
    },
    { key: 'class', header: 'Kelas', sortValue: row => row.className, cell: row => row.className },
    {
      key: 'gender',
      header: 'L/P',
      cell: row => (row.student.gender === 'male' ? 'L' : row.student.gender === 'female' ? 'P' : '-'),
    },
    {
      key: 'age',
      header: 'Usia',
      sortValue: row => ageInYears(row.student.date_of_birth),
      cell: row => {
        const age = ageInYears(row.student.date_of_birth);
        return age === null ? '-' : `${age} th`;
      },
    },
    {
      key: 'measure',
      header: 'TB / BB terakhir',
      sortValue: row => row.latest?.record.measured_at,
      cell: row =>
        row.latest ? (
          <div>
            <p className="tabular-nums">
              {formatDecimal(row.latest.heightCm)} cm · {formatDecimal(row.latest.weightKg)} kg
            </p>
            <p className="text-xs text-fg-subtle">{formatDate(row.latest.record.measured_at)}</p>
          </div>
        ) : (
          <span className="text-fg-subtle">Belum diukur</span>
        ),
    },
    {
      key: 'nutrition',
      header: 'Status gizi',
      sortValue: row => row.latest?.bmi,
      cell: row =>
        row.latest?.category ? (
          <span className="inline-flex items-center gap-1.5 text-sm">
            <span className="size-2 rounded-full" style={{ background: NUTRITION_COLORS[row.latest.category] }} aria-hidden />
            {row.latest.category}
            <span className="text-xs text-fg-subtle">({formatDecimal(row.latest.bmi)})</span>
          </span>
        ) : (
          <span className="text-fg-subtle">-</span>
        ),
    },
    { key: 'imm', header: 'Imunisasi', sortValue: row => row.immunizationCount, cell: row => `${row.immunizationCount}×` },
    {
      key: 'status',
      header: 'Status',
      cell: row => <Badge tone={row.isActive ? 'success' : 'neutral'}>{row.isActive ? 'Aktif' : 'Nonaktif'}</Badge>,
    },
    ...(!canEdit
      ? []
      : [
          {
            key: 'actions',
            header: '',
            className: 'w-12 text-right',
            cell: (row: Row) => (
              <RowActions
                actions={[
                  { label: 'Lihat detail', icon: <Eye className="size-4" />, onSelect: () => viewer.show(row) },
                  { label: 'Ubah', icon: <Pencil className="size-4" />, onSelect: () => editor.show(row) },
                  {
                    label: 'Pindah kelas',
                    icon: <ArrowRightLeft className="size-4" />,
                    onSelect: () => mover.show({ mode: 'move', students: [row] }),
                  },
                  {
                    label: 'Naik kelas',
                    icon: <ArrowUpCircle className="size-4" />,
                    onSelect: () => mover.show({ mode: 'promote', students: [row] }),
                  },
                  row.isActive
                    ? { label: 'Nonaktifkan', icon: <PauseCircle className="size-4" />, tone: 'danger', onSelect: () => askSetActive([row], false) }
                    : { label: 'Aktifkan kembali', icon: <PlayCircle className="size-4" />, onSelect: () => askSetActive([row], true) },
                ]}
              />
            ),
          },
        ]),
  ];

  const exportCsv = () =>
    downloadCsv(`siswa-${slugify(schoolName)}`, filtered, [
      { header: 'Nama', value: row => row.student.full_name },
      { header: 'NISN', value: row => row.student.student_number },
      { header: 'Kelas', value: row => row.className },
      { header: 'Jenis Kelamin', value: row => genderLabel(row.student.gender) },
      { header: 'Tanggal Lahir', value: row => row.student.date_of_birth },
      { header: 'Nama Orang Tua', value: row => row.student.parent_name },
      { header: 'Telepon Orang Tua', value: row => row.student.parent_phone },
      { header: 'Tinggi Terakhir (cm)', value: row => row.latest?.heightCm },
      { header: 'Berat Terakhir (kg)', value: row => row.latest?.weightKg },
      { header: 'IMT', value: row => (row.latest?.bmi ? row.latest.bmi.toFixed(1) : '') },
      { header: 'Status Gizi', value: row => row.latest?.category },
      { header: 'Tanggal Ukur Terakhir', value: row => row.latest?.record.measured_at },
      { header: 'Jumlah Imunisasi Diberikan', value: row => row.immunizationCount },
      { header: 'Status', value: row => (row.isActive ? 'Aktif' : 'Nonaktif') },
    ]);

  const setClassFilter = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set('kelas', value);
    else next.delete('kelas');
    setParams(next, { replace: true });
  };

  return (
    <div>
      <PageHeader
        title="Siswa"
        description="Data siswa, pengukuran terakhir, dan status gizi."
        actions={
          !canEdit ? null : (
            <Button icon={<Plus className="size-4" />} onClick={() => editor.show('new')}>
              Tambah siswa
            </Button>
          )
        }
      />
      <Card>
        <QueryBoundary
          isLoading={students.isLoading}
          error={students.error ?? mRecords.error ?? iRecords.error}
          onRetry={() => {
            void students.refetch();
            void mRecords.refetch();
            void iRecords.refetch();
          }}
        >
          {() => (
            <DataTable
              rows={filtered}
              columns={columns}
              getRowId={row => row.id}
              getSearchText={row => `${row.student.full_name} ${row.student.student_number ?? ''} ${row.student.parent_name ?? ''}`}
              searchPlaceholder="Cari nama / NISN / orang tua"
              onRowClick={row => viewer.show(row)}
              initialSort={{ key: 'name', dir: 'asc' }}
              emptyTitle="Belum ada siswa"
              emptyDescription={!canEdit ? undefined : 'Tambahkan siswa baru atau gunakan aplikasi mobile.'}
              emptyAction={
                !canEdit ? undefined : (
                  <Button icon={<Plus className="size-4" />} onClick={() => editor.show('new')}>
                    Tambah siswa
                  </Button>
                )
              }
              selection={canEdit ? selection : undefined}
              bulkActions={(selectedRows, clear) => (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<ArrowRightLeft className="size-3.5" />}
                    onClick={() => mover.show({ mode: 'move', students: selectedRows })}
                  >
                    Pindah kelas
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<ArrowUpCircle className="size-3.5" />}
                    onClick={() => mover.show({ mode: 'promote', students: selectedRows })}
                  >
                    Naik kelas
                  </Button>
                  {selectedRows.some(item => !item.isActive) ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<PlayCircle className="size-3.5" />}
                      onClick={() => askSetActive(selectedRows.filter(item => !item.isActive), true, clear)}
                    >
                      Aktifkan
                    </Button>
                  ) : null}
                  {selectedRows.some(item => item.isActive) ? (
                    <Button
                      variant="danger"
                      size="sm"
                      icon={<PauseCircle className="size-3.5" />}
                      onClick={() => askSetActive(selectedRows.filter(item => item.isActive), false, clear)}
                    >
                      Nonaktifkan
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
                    label="Jenis kelamin"
                    value={gender}
                    onChange={setGender}
                    options={[
                      { value: '', label: 'Semua L/P' },
                      { value: 'male', label: 'Laki-laki' },
                      { value: 'female', label: 'Perempuan' },
                    ]}
                  />
                  <FilterSelect
                    label="Status gizi"
                    value={nutrition}
                    onChange={setNutrition}
                    options={[
                      { value: '', label: 'Semua status gizi' },
                      ...NUTRITION_CATEGORIES.map(item => ({ value: item, label: item })),
                      { value: 'none', label: 'Belum diukur' },
                    ]}
                  />
                  <FilterSelect
                    label="Status siswa"
                    value={status}
                    onChange={setStatus}
                    options={[
                      { value: 'active', label: 'Aktif' },
                      { value: 'inactive', label: 'Nonaktif' },
                      { value: '', label: 'Semua status' },
                    ]}
                  />
                </>
              }
              actions={
                <>
                  <ImportStudentsButton />
                  <ExportButton kind="students" rows={filtered} label="Ekspor data" />
                  <Button variant="secondary" size="sm" icon={<Download className="size-3.5" />} onClick={exportCsv}>
                    Ekspor CSV
                  </Button>
                </>
              }
            />
          )}
        </QueryBoundary>
      </Card>

      <StudentFormDrawer
        key={`form-${editor.key}`}
        open={editor.open}
        student={editor.target === 'new' ? null : editor.target}
        defaultClassId={classFilter}
        onClose={editor.close}
      />
      <StudentDetailDrawer
        open={viewer.open}
        student={viewer.target}
        onClose={viewer.close}
        onEdit={target => editor.show(target)}
        onMove={target => mover.show({ mode: 'move', students: [target] })}
      />
      <MoveClassDrawer
        key={`move-${mover.key}`}
        open={mover.open}
        mode={mover.target?.mode ?? 'move'}
        students={mover.target?.students ?? []}
        onClose={mover.close}
        onDone={selection.clear}
      />
    </div>
  );
}


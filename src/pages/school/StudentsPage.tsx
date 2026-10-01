import { useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { Download, Pencil, Plus } from 'lucide-react';
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
import { createStudent, moveEnrollment, updateStudent, type StudentInput } from '@/api/school';
import { errorMessage } from '@/api/errors';
import { latestMeasurementByStudent, toMeasurementView, type MeasurementView, type StudentView } from '@/lib/analytics';
import { ageInYears, formatDate, formatDateTime, formatDecimal, genderLabel } from '@/lib/format';
import { downloadCsv, slugify } from '@/lib/csv';
import { NUTRITION_CATEGORIES, NUTRITION_COLORS } from '@/lib/nutrition';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, FilterSelect, type Column } from '@/components/ui/DataTable';
import { Badge, ImmunizationStatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Field, FormError, Input, Select, Textarea } from '@/components/ui/Form';
import { QueryBoundary } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';

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
  const [editing, setEditing] = useState<StudentView | 'new' | null>(null);
  const [detail, setDetail] = useState<Row | null>(null);

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

  const filtered = rows.filter(row => {
    if (classFilter && row.classId !== classFilter) return false;
    if (gender && row.student.gender !== gender) return false;
    if (status === 'active' && !row.isActive) return false;
    if (status === 'inactive' && row.isActive) return false;
    if (nutrition === 'none' && row.latest?.category) return false;
    if (nutrition && nutrition !== 'none' && row.latest?.category !== nutrition) return false;
    return true;
  });

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
            <Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
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
              onRowClick={setDetail}
              initialSort={{ key: 'name', dir: 'asc' }}
              emptyTitle="Belum ada siswa"
              emptyDescription={!canEdit ? undefined : 'Tambahkan siswa baru atau gunakan aplikasi mobile.'}
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
                <Button variant="secondary" size="sm" icon={<Download className="size-3.5" />} onClick={exportCsv}>
                  Ekspor CSV
                </Button>
              }
            />
          )}
        </QueryBoundary>
      </Card>

      {editing ? (
        <StudentFormModal
          student={editing === 'new' ? null : editing}
          defaultClassId={classFilter}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {detail ? <StudentDetailModal row={detail} onClose={() => setDetail(null)} /> : null}
    </div>
  );
}

function StudentFormModal({
  student,
  defaultClassId,
  onClose,
}: {
  student: StudentView | null;
  defaultClassId: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const classes = useClasses();
  const s = student?.student;
  const [form, setForm] = useState({
    fullName: s?.full_name ?? '',
    studentNumber: s?.student_number ?? '',
    gender: (s?.gender as 'male' | 'female' | null) ?? null,
    dateOfBirth: s?.date_of_birth ?? '',
    address: s?.address ?? '',
    parentName: s?.parent_name ?? '',
    parentPhone: s?.parent_phone ?? '',
    notes: s?.notes ?? '',
    classId: student?.classId ?? defaultClassId ?? '',
    isActive: s?.is_active !== false,
  });
  const [error, setError] = useState<string | null>(null);

  const create = useSchoolMutation((input: StudentInput & { classId: string }, role) => createStudent(input, role));
  const update = useSchoolMutation(async (input: typeof form, role) => {
    if (!student) return;
    await updateStudent({ ...input, studentId: student.id, isActive: input.isActive }, role);
    if (input.classId && input.classId !== student.classId) await moveEnrollment(student.enrollmentId, input.classId, role);
  });
  const pending = create.isPending || update.isPending;

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm(current => ({ ...current, [key]: value }));

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!form.fullName.trim()) return setError('Nama siswa wajib diisi.');
    if (!form.studentNumber.trim()) return setError('NISN wajib diisi.');
    if (!form.classId) return setError('Pilih kelas siswa.');
    try {
      if (student) {
        await update.mutateAsync(form);
        toast.success('Data siswa diperbarui.');
      } else {
        await create.mutateAsync(form);
        toast.success('Siswa baru ditambahkan.');
      }
      onClose();
    } catch (submitError) {
      setError(errorMessage(submitError));
    }
  };

  return (
    <Modal
      open
      size="lg"
      title={student ? 'Ubah data siswa' : 'Tambah siswa'}
      description={student ? student.student.full_name : 'Siswa langsung didaftarkan ke kelas terpilih (status aktif).'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Batal
          </Button>
          <Button type="submit" form="student-form" loading={pending}>
            Simpan
          </Button>
        </>
      }
    >
      <form id="student-form" onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <FormError message={error} />
        </div>
        <Field label="Nama lengkap *" className="sm:col-span-2">
          {id => <Input id={id} value={form.fullName} onChange={e => set('fullName', e.target.value)} />}
        </Field>
        <Field label="NISN *">
          {id => <Input id={id} inputMode="numeric" value={form.studentNumber} onChange={e => set('studentNumber', e.target.value)} />}
        </Field>
        <Field label="Kelas *" hint={student ? 'Mengubah kelas memindahkan enrollment siswa.' : undefined}>
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
        <Field label="Jenis kelamin">
          {id => (
            <Select
              id={id}
              value={form.gender ?? ''}
              onChange={e => set('gender', (e.target.value || null) as 'male' | 'female' | null)}
            >
              <option value="">-</option>
              <option value="male">Laki-laki</option>
              <option value="female">Perempuan</option>
            </Select>
          )}
        </Field>
        <Field label="Tanggal lahir">
          {id => <Input id={id} type="date" value={form.dateOfBirth} onChange={e => set('dateOfBirth', e.target.value)} />}
        </Field>
        {student ? (
          <>
            <Field label="Nama orang tua">
              {id => <Input id={id} value={form.parentName} onChange={e => set('parentName', e.target.value)} />}
            </Field>
            <Field label="Telepon orang tua">
              {id => <Input id={id} type="tel" value={form.parentPhone} onChange={e => set('parentPhone', e.target.value)} />}
            </Field>
            <Field label="Alamat" className="sm:col-span-2">
              {id => <Input id={id} value={form.address} onChange={e => set('address', e.target.value)} />}
            </Field>
            <Field label="Catatan" className="sm:col-span-2">
              {id => <Textarea id={id} value={form.notes} onChange={e => set('notes', e.target.value)} />}
            </Field>
            <label className="flex items-center gap-2 text-sm text-fg sm:col-span-2">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={e => set('isActive', e.target.checked)}
                className="size-4 accent-brand-500"
              />
              Siswa aktif
            </label>
          </>
        ) : null}
      </form>
    </Modal>
  );
}

function StudentDetailModal({ row, onClose }: { row: Row; onClose: () => void }) {
  const mSessions = useMeasurementSessions();
  const iSessions = useImmunizationSessions();
  const mRecords = useMeasurementRecords();
  const iRecords = useImmunizationRecords();
  const sessionName = new Map([...(mSessions.data ?? []), ...(iSessions.data ?? [])].map(item => [item.id, item.name]));
  const measurements = (mRecords.data ?? []).filter(item => item.student_id === row.id).map(toMeasurementView);
  const immunizations = (iRecords.data ?? []).filter(item => item.student_id === row.id);
  const s = row.student;

  return (
    <Modal open size="lg" title={s.full_name} description={`NISN ${s.student_number ?? '-'} · ${row.className}`} onClose={onClose}>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
        {[
          ['Jenis kelamin', genderLabel(s.gender)],
          ['Tanggal lahir', formatDate(s.date_of_birth)],
          ['Usia', ageInYears(s.date_of_birth) === null ? '-' : `${ageInYears(s.date_of_birth)} tahun`],
          ['Orang tua', s.parent_name ?? '-'],
          ['Telepon', s.parent_phone ?? '-'],
          ['Alamat', s.address ?? '-'],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-fg-subtle">{label}</dt>
            <dd className="text-fg">{value}</dd>
          </div>
        ))}
      </dl>

      <h3 className="mt-6 text-sm font-semibold text-fg">Riwayat pengukuran</h3>
      {measurements.length === 0 ? (
        <p className="mt-2 text-sm text-fg-subtle">Belum ada data pengukuran.</p>
      ) : (
        <div className="mt-2 overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="bg-card-muted/60 text-left text-xs text-fg-subtle">
              <tr>
                <th className="px-3 py-2 font-medium">Tanggal</th>
                <th className="px-3 py-2 font-medium">Sesi</th>
                <th className="px-3 py-2 font-medium">TB (cm)</th>
                <th className="px-3 py-2 font-medium">BB (kg)</th>
                <th className="px-3 py-2 font-medium">IMT</th>
              </tr>
            </thead>
            <tbody>
              {measurements.map(item => (
                <tr key={item.record.id} className="border-t border-line">
                  <td className="px-3 py-2">{formatDateTime(item.record.measured_at)}</td>
                  <td className="px-3 py-2">{sessionName.get(item.record.session_id) ?? '-'}</td>
                  <td className="px-3 py-2 tabular-nums">{formatDecimal(item.heightCm)}</td>
                  <td className="px-3 py-2 tabular-nums">{formatDecimal(item.weightKg)}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {formatDecimal(item.bmi)} {item.category ? <span className="text-xs text-fg-subtle">· {item.category}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 className="mt-6 text-sm font-semibold text-fg">Riwayat imunisasi</h3>
      {immunizations.length === 0 ? (
        <p className="mt-2 text-sm text-fg-subtle">Belum ada catatan imunisasi.</p>
      ) : (
        <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
          {immunizations.map(item => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <div>
                <p className="font-medium text-fg">
                  {item.vaccine_name}
                  {item.dose_label ? ` · ${item.dose_label}` : ''}
                </p>
                <p className="text-xs text-fg-subtle">
                  {formatDateTime(item.administered_at)} · {sessionName.get(item.session_id) ?? '-'}
                </p>
              </div>
              <ImmunizationStatusBadge status={item.status} />
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

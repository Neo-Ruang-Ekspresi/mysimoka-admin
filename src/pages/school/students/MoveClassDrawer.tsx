import { useMemo, useState } from 'react';
import { useClasses, useSchoolMutation } from '@/hooks/useSchoolData';
import { moveEnrollments, promoteStudents } from '@/api/crud/students';
import { errorMessage } from '@/api/errors';
import type { StudentView } from '@/lib/analytics';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Field, FormError, Select } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';

export type MoveMode = 'move' | 'promote';

/**
 * Pindah kelas (ubah class_id enrollment aktif) atau naik kelas (enrollment lama → `graduated`,
 * enrollment baru aktif di kelas tujuan) untuk satu atau banyak siswa.
 */
export function MoveClassDrawer({
  open,
  mode,
  students,
  onClose,
  onDone,
}: {
  open: boolean;
  mode: MoveMode;
  students: StudentView[];
  onClose: () => void;
  onDone?: () => void;
}) {
  const toast = useToast();
  const classes = useClasses();
  const [classId, setClassId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const currentIds = useMemo(() => new Set(students.map(item => item.classId)), [students]);
  const options = (classes.data ?? []).filter(item => !(currentIds.size === 1 && currentIds.has(item.id)));

  const mutation = useSchoolMutation(async (_: void, role) => {
    if (mode === 'move') {
      const count = await moveEnrollments(
        students.map(item => item.enrollmentId),
        classId,
        role,
      );
      return { ok: count, failed: 0 };
    }
    const result = await promoteStudents(
      students.map(item => ({ studentId: item.id, enrollmentId: item.enrollmentId })),
      classId,
      role,
    );
    if (result.ok === 0 && result.failed.length > 0) throw result.failed[0].error;
    return { ok: result.ok, failed: result.failed.length };
  });

  const target = classes.data?.find(item => item.id === classId);

  const onSubmit = async () => {
    setError(null);
    if (!classId) return setFieldError('Pilih kelas tujuan.');
    setFieldError(null);
    try {
      const result = await mutation.mutateAsync();
      const verb = mode === 'move' ? 'dipindahkan' : 'dinaikkan';
      if (result.failed > 0) {
        toast.warning(`${result.ok} siswa ${verb} ke ${target?.name ?? 'kelas tujuan'}, ${result.failed} gagal.`, {
          description: 'Siswa yang gagal mungkin sudah terdaftar di kelas tujuan.',
        });
      } else {
        toast.success(`${result.ok} siswa ${verb} ke ${target?.name ?? 'kelas tujuan'}.`);
      }
      onDone?.();
      onClose();
    } catch (submitError) {
      setError(errorMessage(submitError));
    }
  };

  const title = mode === 'move' ? 'Pindah kelas' : 'Naik kelas';
  const names = students.slice(0, 5).map(item => item.student.full_name).join(', ');

  return (
    <Drawer
      open={open}
      title={`${title} (${students.length} siswa)`}
      description={students.length > 5 ? `${names}, dan ${students.length - 5} lainnya` : names}
      onClose={onClose}
      onSubmit={() => void onSubmit()}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Batal
          </Button>
          <Button type="submit" loading={mutation.isPending} disabled={students.length === 0}>
            {title}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormError message={error} />
        <Field
          label="Kelas tujuan *"
          error={fieldError}
          hint={
            mode === 'move'
              ? 'Untuk koreksi penempatan: kelas pada enrollment saat ini diganti, tanpa menambah riwayat.'
              : 'Untuk kenaikan kelas / tahun ajaran baru: kelas lama ditandai "Lulus / naik" (riwayat tetap ada) dan siswa didaftarkan aktif di kelas tujuan.'
          }
        >
          {id => (
            <Select id={id} value={classId} onChange={e => setClassId(e.target.value)} aria-invalid={Boolean(fieldError)}>
              <option value="">Pilih kelas</option>
              {options.map(item => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.academic_year?.label ? ` · ${item.academic_year.label}` : ''}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {students.length > 1 ? (
          <ul className="max-h-60 divide-y divide-line overflow-y-auto rounded-lg border border-line text-sm">
            {students.map(item => (
              <li key={item.id} className="flex justify-between gap-2 px-3 py-2">
                <span className="truncate text-fg">{item.student.full_name}</span>
                <span className="shrink-0 text-xs text-fg-subtle">{item.className}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Drawer>
  );
}

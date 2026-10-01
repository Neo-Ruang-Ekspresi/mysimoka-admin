import { useState } from 'react';
import { useClasses, useSchoolMutation, useStudents } from '@/hooks/useSchoolData';
import { createStudent, updateEnrollment, updateStudent, type StudentInput } from '@/api/crud/students';
import { errorMessage } from '@/api/errors';
import type { StudentView } from '@/lib/analytics';
import { todayIso } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Field, FormError, Input, Select, Textarea } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';

type FormState = {
  fullName: string;
  studentNumber: string;
  gender: 'male' | 'female' | null;
  dateOfBirth: string;
  address: string;
  parentName: string;
  parentPhone: string;
  notes: string;
  classId: string;
  isActive: boolean;
};

type Errors = Partial<Record<keyof FormState | 'form', string>>;

/** Drawer tambah/ubah siswa. Pasang dengan `key` baru setiap dibuka agar form ter-reset. */
export function StudentFormDrawer({
  open,
  student,
  defaultClassId,
  onClose,
}: {
  open: boolean;
  student: StudentView | null;
  defaultClassId: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const classes = useClasses();
  const students = useStudents();
  const s = student?.student;
  const [form, setForm] = useState<FormState>({
    fullName: s?.full_name ?? '',
    studentNumber: s?.student_number ?? '',
    gender: (s?.gender as 'male' | 'female' | null) ?? null,
    dateOfBirth: s?.date_of_birth ?? '',
    address: s?.address ?? '',
    parentName: s?.parent_name ?? '',
    parentPhone: s?.parent_phone ?? '',
    notes: s?.notes ?? '',
    classId: student?.classId ?? defaultClassId ?? '',
    isActive: s ? s.is_active !== false : true,
  });
  const [errors, setErrors] = useState<Errors>({});

  const create = useSchoolMutation((input: StudentInput & { classId: string }, role) => createStudent(input, role));
  const update = useSchoolMutation(async (input: FormState, role) => {
    if (!student) return;
    await updateStudent({ ...input, studentId: student.id, isActive: input.isActive }, role);
    if (input.classId && input.classId !== student.classId) {
      await updateEnrollment(student.enrollmentId, { classId: input.classId }, role);
    }
    // Mengaktifkan kembali siswa yang enrollment-nya tidak aktif → aktifkan juga enrollment-nya.
    if (input.isActive && student.enrollmentStatus && student.enrollmentStatus !== 'active') {
      await updateEnrollment(student.enrollmentId, { status: 'active' }, role);
    }
  });
  const pending = create.isPending || update.isPending;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(current => ({ ...current, [key]: value }));
    setErrors(current => (current[key] ? { ...current, [key]: undefined } : current));
  };

  const validate = (): Errors => {
    const next: Errors = {};
    const name = form.fullName.trim();
    const number = form.studentNumber.trim();
    if (!name) next.fullName = 'Nama siswa wajib diisi.';
    else if (name.length < 2) next.fullName = 'Nama terlalu pendek.';
    if (!number) next.studentNumber = 'NISN wajib diisi.';
    else if (!/^[0-9A-Za-z./-]{3,20}$/.test(number)) next.studentNumber = 'NISN 3–20 karakter (angka/huruf).';
    else {
      const dup = (students.data ?? []).find(item => item.id !== student?.id && item.student.student_number?.trim() === number);
      if (dup) next.studentNumber = `NISN sudah dipakai ${dup.student.full_name}.`;
    }
    if (!form.classId) next.classId = 'Pilih kelas siswa.';
    if (form.dateOfBirth && form.dateOfBirth > todayIso()) next.dateOfBirth = 'Tanggal lahir tidak boleh di masa depan.';
    if (form.parentPhone.trim() && !/^[+0-9\s-]{6,20}$/.test(form.parentPhone.trim())) next.parentPhone = 'Nomor telepon tidak valid.';
    return next;
  };

  const onSubmit = async () => {
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;
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
      const message = errorMessage(submitError);
      setErrors(message.includes('NISN') ? { studentNumber: message } : { form: message });
    }
  };

  return (
    <Drawer
      open={open}
      size="lg"
      title={student ? 'Ubah data siswa' : 'Tambah siswa'}
      description={student ? student.student.full_name : 'Siswa langsung didaftarkan ke kelas terpilih (status aktif).'}
      onClose={onClose}
      onSubmit={() => void onSubmit()}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Batal
          </Button>
          <Button type="submit" loading={pending}>
            Simpan
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <FormError message={errors.form} />
        </div>
        <Field label="Nama lengkap *" className="sm:col-span-2" error={errors.fullName}>
          {id => <Input id={id} value={form.fullName} onChange={e => set('fullName', e.target.value)} aria-invalid={Boolean(errors.fullName)} />}
        </Field>
        <Field label="NISN *" error={errors.studentNumber}>
          {id => (
            <Input
              id={id}
              inputMode="numeric"
              value={form.studentNumber}
              onChange={e => set('studentNumber', e.target.value)}
              aria-invalid={Boolean(errors.studentNumber)}
            />
          )}
        </Field>
        <Field label="Kelas *" error={errors.classId} hint={student ? 'Mengubah kelas memindahkan enrollment aktif siswa.' : undefined}>
          {id => (
            <Select id={id} value={form.classId} onChange={e => set('classId', e.target.value)} aria-invalid={Boolean(errors.classId)}>
              <option value="">Pilih kelas</option>
              {(classes.data ?? []).map(item => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.academic_year?.label ? ` · ${item.academic_year.label}` : ''}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Jenis kelamin">
          {id => (
            <Select id={id} value={form.gender ?? ''} onChange={e => set('gender', (e.target.value || null) as 'male' | 'female' | null)}>
              <option value="">-</option>
              <option value="male">Laki-laki</option>
              <option value="female">Perempuan</option>
            </Select>
          )}
        </Field>
        <Field label="Tanggal lahir" error={errors.dateOfBirth}>
          {id => <Input id={id} type="date" max={todayIso()} value={form.dateOfBirth} onChange={e => set('dateOfBirth', e.target.value)} />}
        </Field>
        <Field label="Nama orang tua">
          {id => <Input id={id} value={form.parentName} onChange={e => set('parentName', e.target.value)} />}
        </Field>
        <Field label="Telepon orang tua" error={errors.parentPhone}>
          {id => <Input id={id} type="tel" value={form.parentPhone} onChange={e => set('parentPhone', e.target.value)} />}
        </Field>
        <Field label="Alamat" className="sm:col-span-2">
          {id => <Input id={id} value={form.address} onChange={e => set('address', e.target.value)} />}
        </Field>
        <Field label="Catatan" className="sm:col-span-2">
          {id => <Textarea id={id} value={form.notes} onChange={e => set('notes', e.target.value)} />}
        </Field>
        {student ? (
          <label className="flex items-start gap-2 text-sm text-fg sm:col-span-2">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={e => set('isActive', e.target.checked)}
              className="mt-0.5 size-4 accent-brand-500"
            />
            <span>
              Siswa aktif
              <span className="block text-xs text-fg-subtle">Nonaktif = tidak muncul di roster sesi; data riwayat tetap tersimpan.</span>
            </span>
          </label>
        ) : null}
      </div>
    </Drawer>
  );
}

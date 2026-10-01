import { useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { useSchoolScope } from '@/scope/SchoolScope';
import { useClasses, useSchoolMutation } from '@/hooks/useSchoolData';
import {
  createImmunizationSession,
  createMeasurementSession,
  updateSession,
  type SessionKind,
} from '@/api/crud/sessions';
import { errorMessage } from '@/api/errors';
import type { ImmunizationSessionRow, MeasurementSessionRow, SessionStatus } from '@/api/types';
import { todayIso } from '@/lib/format';
import { SESSION_STATUS_LABEL } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Field, FormError, Input, Select, Textarea } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';

export type AnySession = MeasurementSessionRow &
  Partial<Pick<ImmunizationSessionRow, 'vaccine_name' | 'dose_label' | 'officer_name'>>;

type FormState = {
  name: string;
  classId: string;
  sessionDate: string;
  status: SessionStatus;
  note: string;
  vaccineName: string;
  doseLabel: string;
  officerName: string;
};
type Errors = Partial<Record<keyof FormState | 'form', string>>;

/**
 * Drawer buat/ubah sesi. Buat: `can.createSessions` (admin & guru). Ubah: `can.manageSessions`.
 * Pasang dengan `key` baru setiap dibuka.
 */
export function SessionFormDrawer({
  open,
  kind,
  session,
  recordCount = 0,
  onClose,
  onCreated,
}: {
  open: boolean;
  kind: SessionKind;
  session: AnySession | null;
  recordCount?: number;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const { schoolId } = useSchoolScope();
  const { userId } = useAuth();
  const toast = useToast();
  const classes = useClasses();
  const [form, setForm] = useState<FormState>({
    name: session?.name ?? '',
    classId: session?.class_id ?? '',
    sessionDate: session?.session_date ?? todayIso(),
    status: session?.status ?? 'active',
    note: session?.note ?? '',
    vaccineName: session?.vaccine_name ?? '',
    doseLabel: session?.dose_label ?? '',
    officerName: session?.officer_name ?? '',
  });
  const [errors, setErrors] = useState<Errors>({});

  const mutation = useSchoolMutation(async (input: FormState, role): Promise<string> => {
    if (session) {
      await updateSession(kind, session.id, { ...input, note: input.note }, role);
      return session.id;
    }
    if (!userId) throw new Error('Data user tidak ditemukan. Silakan login ulang.');
    const base = { schoolId, classId: input.classId, name: input.name, note: input.note, sessionDate: input.sessionDate, createdBy: userId };
    return kind === 'measurement'
      ? createMeasurementSession(base, role)
      : createImmunizationSession({ ...base, vaccineName: input.vaccineName, doseLabel: input.doseLabel, officerName: input.officerName }, role);
  });

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(current => ({ ...current, [key]: value }));
    setErrors(current => (current[key] ? { ...current, [key]: undefined } : current));
  };

  const onSubmit = async () => {
    const next: Errors = {};
    if (!form.name.trim()) next.name = 'Nama sesi wajib diisi.';
    else if (form.name.trim().length > 120) next.name = 'Nama sesi maksimal 120 karakter.';
    if (!form.classId) next.classId = 'Pilih kelas.';
    if (!form.sessionDate) next.sessionDate = 'Tanggal sesi wajib diisi.';
    if (kind === 'immunization' && !form.vaccineName.trim()) next.vaccineName = 'Jenis imunisasi wajib diisi.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    try {
      const id = await mutation.mutateAsync(form);
      toast.success(session ? 'Sesi diperbarui.' : 'Sesi dibuat.');
      onClose();
      if (!session) onCreated?.(id);
    } catch (submitError) {
      setErrors({ form: errorMessage(submitError) });
    }
  };

  const classChanged = Boolean(session && form.classId !== session.class_id);

  return (
    <Drawer
      open={open}
      size="lg"
      title={session ? 'Ubah sesi' : kind === 'measurement' ? 'Buat sesi pengukuran' : 'Buat sesi imunisasi'}
      description={
        session ? session.name : 'Sesi langsung berstatus aktif dan dapat diisi dari dashboard ini atau aplikasi mobile.'
      }
      onClose={onClose}
      onSubmit={() => void onSubmit()}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Batal
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            {session ? 'Simpan' : 'Buat sesi'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <FormError message={errors.form} />
        </div>
        <Field label="Nama sesi *" className="sm:col-span-2" error={errors.name}>
          {id => (
            <Input
              id={id}
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder={kind === 'measurement' ? 'mis. Pengukuran Semester 1' : 'mis. BIAS Campak Rubella'}
              aria-invalid={Boolean(errors.name)}
            />
          )}
        </Field>
        <Field
          label="Kelas *"
          error={errors.classId}
          hint={classChanged && recordCount > 0 ? `${recordCount} data yang sudah dicatat tetap terhubung ke sesi ini.` : undefined}
        >
          {id => (
            <Select id={id} value={form.classId} onChange={e => set('classId', e.target.value)} aria-invalid={Boolean(errors.classId)}>
              <option value="">Pilih kelas</option>
              {(classes.data ?? []).map(item => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Tanggal *" error={errors.sessionDate}>
          {id => <Input id={id} type="date" value={form.sessionDate} onChange={e => set('sessionDate', e.target.value)} />}
        </Field>
        {session ? (
          <Field label="Status" className="sm:col-span-2">
            {id => (
              <Select id={id} value={form.status} onChange={e => set('status', e.target.value as SessionStatus)}>
                {(Object.keys(SESSION_STATUS_LABEL) as SessionStatus[]).map(value => (
                  <option key={value} value={value}>
                    {SESSION_STATUS_LABEL[value]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
        {kind === 'immunization' ? (
          <>
            <Field label="Jenis imunisasi / vaksin *" error={errors.vaccineName}>
              {id => (
                <Input
                  id={id}
                  value={form.vaccineName}
                  onChange={e => set('vaccineName', e.target.value)}
                  placeholder="mis. MR, DT, Td, HPV"
                  aria-invalid={Boolean(errors.vaccineName)}
                />
              )}
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
      </div>
    </Drawer>
  );
}

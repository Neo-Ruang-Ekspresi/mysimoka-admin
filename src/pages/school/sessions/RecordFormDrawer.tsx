import { useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { useSchoolMutation } from '@/hooks/useSchoolData';
import {
  updateImmunizationRecord,
  updateMeasurementRecord,
  upsertImmunizationRecord,
  upsertMeasurementRecord,
  type RecordKind,
} from '@/api/crud/records';
import { errorMessage } from '@/api/errors';
import type { ImmunizationRecordRow, ImmunizationRecordStatus } from '@/api/types';
import type { MeasurementView } from '@/lib/analytics';
import { IMMUNIZATION_STATUS_LABEL } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Field, FormError, Input, Select, Textarea } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import type { AnySession } from './SessionFormDrawer';

export type RecordTarget = {
  studentId: string;
  enrollmentId: string | null;
  name: string;
  measurement: MeasurementView | null;
  immunization: ImmunizationRecordRow | null;
};

type FormState = {
  height: string;
  weight: string;
  notes: string;
  status: ImmunizationRecordStatus;
  vaccineName: string;
  doseLabel: string;
  officerName: string;
  batchNumber: string;
  injectionSite: string;
  adverseEventNotes: string;
};
type Errors = Partial<Record<keyof FormState | 'form', string>>;

const parseNum = (value: string) => (value.trim() ? Number(value.replace(',', '.')) : null);

/**
 * Input / ubah data siswa di sesi. Record baru → upsert (cermin mobile);
 * record yang sudah ada → `update_*_by_pk` (waktu ukur/pemberian tetap).
 */
export function RecordFormDrawer({
  open,
  kind,
  session,
  target,
  onClose,
}: {
  open: boolean;
  kind: RecordKind;
  session: AnySession;
  target: RecordTarget | null;
  onClose: () => void;
}) {
  const { userId } = useAuth();
  const toast = useToast();
  const m = target?.measurement ?? null;
  const i = target?.immunization ?? null;
  const existingId = kind === 'measurement' ? m?.record.id : i?.id;
  const [form, setForm] = useState<FormState>({
    height: m?.heightCm?.toString() ?? '',
    weight: m?.weightKg?.toString() ?? '',
    notes: (kind === 'measurement' ? m?.record.notes : i?.notes) ?? '',
    status: i?.status ?? 'given',
    vaccineName: i?.vaccine_name ?? session.vaccine_name ?? '',
    doseLabel: i?.dose_label ?? session.dose_label ?? '',
    officerName: i?.officer_name ?? session.officer_name ?? '',
    batchNumber: i?.batch_number ?? '',
    injectionSite: i?.injection_site ?? '',
    adverseEventNotes: i?.adverse_event_notes ?? '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(current => ({ ...current, [key]: value }));
    setErrors(current => (current[key] ? { ...current, [key]: undefined } : current));
  };

  const mutation = useSchoolMutation(async (input: FormState, role) => {
    if (!target) return;
    if (kind === 'measurement') {
      const values = { heightCm: parseNum(input.height), weightKg: parseNum(input.weight), notes: input.notes };
      if (existingId) return updateMeasurementRecord(existingId, { ...values, recordedBy: userId }, role);
      if (!userId) throw new Error('Data user tidak ditemukan. Silakan login ulang.');
      return upsertMeasurementRecord(
        { sessionId: session.id, studentId: target.studentId, studentEnrollmentId: target.enrollmentId, recordedBy: userId, ...values },
        role,
      );
    }
    const values = {
      status: input.status,
      vaccineName: input.vaccineName,
      doseLabel: input.doseLabel,
      officerName: input.officerName,
      batchNumber: input.batchNumber,
      injectionSite: input.injectionSite,
      notes: input.notes,
      adverseEventNotes: input.adverseEventNotes,
    };
    if (existingId) return updateImmunizationRecord(existingId, { ...values, recordedBy: userId }, role);
    if (!userId) throw new Error('Data user tidak ditemukan. Silakan login ulang.');
    return upsertImmunizationRecord(
      { sessionId: session.id, studentId: target.studentId, studentEnrollmentId: target.enrollmentId, recordedBy: userId, ...values },
      role,
    );
  });

  const onSubmit = async () => {
    const next: Errors = {};
    if (kind === 'measurement') {
      const height = parseNum(form.height);
      const weight = parseNum(form.weight);
      // Rentang mengikuti CHECK constraint di measurement_recording_schema.sql
      if (height === null && weight === null) next.form = 'Isi minimal tinggi atau berat badan.';
      if (height !== null && (!Number.isFinite(height) || height < 30 || height > 250)) next.height = 'Tinggi harus 30–250 cm.';
      if (weight !== null && (!Number.isFinite(weight) || weight < 1 || weight > 300)) next.weight = 'Berat harus 1–300 kg.';
    } else if (!form.vaccineName.trim()) {
      next.vaccineName = 'Jenis imunisasi wajib diisi.';
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    try {
      await mutation.mutateAsync(form);
      toast.success(existingId ? 'Data diperbarui.' : 'Data tersimpan.');
      onClose();
    } catch (submitError) {
      setErrors({ form: errorMessage(submitError) });
    }
  };

  return (
    <Drawer
      open={open}
      title={`${existingId ? 'Ubah' : 'Input'} ${kind === 'measurement' ? 'pengukuran' : 'imunisasi'}`}
      description={target ? `${target.name} · input manual` : undefined}
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
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <FormError message={errors.form} />
        </div>
        {kind === 'measurement' ? (
          <>
            <Field label="Tinggi badan (cm)" error={errors.height}>
              {id => (
                <Input id={id} inputMode="decimal" value={form.height} onChange={e => set('height', e.target.value)} placeholder="mis. 125.5" aria-invalid={Boolean(errors.height)} />
              )}
            </Field>
            <Field label="Berat badan (kg)" error={errors.weight}>
              {id => (
                <Input id={id} inputMode="decimal" value={form.weight} onChange={e => set('weight', e.target.value)} placeholder="mis. 28.2" aria-invalid={Boolean(errors.weight)} />
              )}
            </Field>
          </>
        ) : (
          <>
            <Field label="Status *">
              {id => (
                <Select id={id} value={form.status} onChange={e => set('status', e.target.value as ImmunizationRecordStatus)}>
                  {(Object.keys(IMMUNIZATION_STATUS_LABEL) as ImmunizationRecordStatus[]).map(status => (
                    <option key={status} value={status}>
                      {IMMUNIZATION_STATUS_LABEL[status]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Vaksin *" error={errors.vaccineName}>
              {id => <Input id={id} value={form.vaccineName} onChange={e => set('vaccineName', e.target.value)} aria-invalid={Boolean(errors.vaccineName)} />}
            </Field>
            <Field label="Dosis">{id => <Input id={id} value={form.doseLabel} onChange={e => set('doseLabel', e.target.value)} />}</Field>
            <Field label="Petugas">{id => <Input id={id} value={form.officerName} onChange={e => set('officerName', e.target.value)} />}</Field>
            <Field label="No. batch">{id => <Input id={id} value={form.batchNumber} onChange={e => set('batchNumber', e.target.value)} />}</Field>
            <Field label="Lokasi suntik">{id => <Input id={id} value={form.injectionSite} onChange={e => set('injectionSite', e.target.value)} />}</Field>
            <Field label="KIPI (kejadian ikutan pasca imunisasi)" className="sm:col-span-2">
              {id => <Textarea id={id} value={form.adverseEventNotes} onChange={e => set('adverseEventNotes', e.target.value)} />}
            </Field>
          </>
        )}
        <Field label="Catatan" className="sm:col-span-2">
          {id => <Textarea id={id} value={form.notes} onChange={e => set('notes', e.target.value)} />}
        </Field>
      </div>
    </Drawer>
  );
}

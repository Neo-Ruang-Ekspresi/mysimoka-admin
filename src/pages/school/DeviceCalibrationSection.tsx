import { useState } from 'react';
import { Gauge, Pencil, TrendingDown, TrendingUp } from 'lucide-react';
import { useSchoolScope } from '@/scope/SchoolScope';
import { useSchoolMutation } from '@/hooks/useSchoolData';
import { calibrationsForDevice, latestChecks, type CheckSummary } from '@/hooks/useCalibrations';
import {
  CALIBRATION_KIND_LABEL,
  saveGlobalTolerances,
  saveSchoolTolerances,
  type CalibrationKind,
  type CalibrationRow,
  type CalibrationSettings,
  type CalibrationsResult,
} from '@/api/crud/calibrations';
import type { DeviceRow } from '@/api/crud/devices';
import { errorMessage } from '@/api/errors';
import { formatDateTime } from '@/lib/format';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Modal } from '@/components/ui/Modal';
import { Field, FormError, Input } from '@/components/ui/Form';
import { EmptyState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';

// Read-only riwayat cek akurasi/kalibrasi per perangkat + batas toleransi (sekolah/global).

function unit(measure: string | null) {
  return measure === 'height' ? 'cm' : 'kg';
}

function digits(measure: string | null) {
  return measure === 'height' ? 1 : 2;
}

function signed(value: number | null, fractionDigits: number) {
  if (value === null || !Number.isFinite(value)) return '-';
  const text = value.toLocaleString('id-ID', { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
  return value > 0 ? `+${text}` : text;
}

function fixed(value: number | null, fractionDigits: number) {
  if (value === null || !Number.isFinite(value)) return '-';
  return value.toLocaleString('id-ID', { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
}

function kindLabel(kind: string) {
  return CALIBRATION_KIND_LABEL[kind as CalibrationKind] ?? kind;
}

/** Badge ringkas untuk kolom tabel perangkat: bias cek terakhir (berat, lalu tinggi). */
export function DeviceAccuracyBadge({ rows, device, onOpen }: { rows: CalibrationRow[]; device: DeviceRow; onOpen: () => void }) {
  const summaries = latestChecks(calibrationsForDevice(rows, device));
  if (summaries.length === 0) {
    return rows.length === 0 ? (
      <span className="text-xs text-fg-subtle">-</span>
    ) : (
      <button type="button" onClick={onOpen} className="text-xs text-fg-subtle underline-offset-2 hover:underline">
        Belum dicek
      </button>
    );
  }
  return (
    <button type="button" onClick={onOpen} className="flex flex-col items-start gap-1 text-left">
      {summaries.map(({ measure, latest }) => (
        <Badge key={measure} tone={latest.within_tolerance ? 'success' : 'warning'}>
          {measure === 'weight' ? 'Berat' : 'Tinggi'} {signed(latest.bias, digits(measure))} {unit(measure)}
        </Badge>
      ))}
    </button>
  );
}

function TrendLine({ summary }: { summary: CheckSummary }) {
  const { latest, previous, measure } = summary;
  const d = digits(measure);
  const better =
    previous && latest.abs_error !== null && previous.abs_error !== null ? latest.abs_error < previous.abs_error : null;
  return (
    <div className="rounded-lg border border-line px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-fg">
          {measure === 'weight' ? 'Berat' : 'Tinggi'}: bias terakhir {signed(latest.bias, d)} {unit(measure)} (
          {signed(latest.pct_error, 1)}%)
        </p>
        <Badge tone={latest.within_tolerance ? 'success' : 'warning'}>
          {latest.within_tolerance ? 'Dalam toleransi' : 'Di luar toleransi'}
        </Badge>
      </div>
      <p className="mt-1 text-xs text-fg-subtle">
        Acuan {fixed(latest.reference_value, d)} {unit(measure)} · rata-rata {fixed(latest.mean_value, d)} {unit(measure)} · SD{' '}
        {fixed(latest.sd, d + 1)} · n={latest.n ?? '-'} · toleransi ±{fixed(latest.tolerance, d)} {unit(measure)} ·{' '}
        {formatDateTime(latest.created_at)}
      </p>
      {previous ? (
        <p className="mt-1 flex items-center gap-1 text-xs text-fg-muted">
          {better ? <TrendingDown className="size-3.5 text-success" /> : <TrendingUp className="size-3.5 text-warning" />}
          Sebelumnya {signed(previous.bias, d)} {unit(measure)} ({formatDateTime(previous.created_at)}) →{' '}
          {better ? 'lebih akurat' : 'tidak lebih akurat'}
        </p>
      ) : null}
    </div>
  );
}

export function DeviceCalibrationHistoryModal({
  open,
  device,
  title,
  rows,
  nameByUser,
  onClose,
}: {
  open: boolean;
  device: DeviceRow | null;
  title: string;
  rows: CalibrationRow[];
  nameByUser: Map<string, string>;
  onClose: () => void;
}) {
  const deviceRows = device ? calibrationsForDevice(rows, device) : [];
  const summaries = latestChecks(deviceRows);
  return (
    <Modal open={open} title={`Akurasi & kalibrasi — ${title}`} description="Dicatat otomatis oleh aplikasi MySimoka." onClose={onClose} size="xl">
      {deviceRows.length === 0 ? (
        <EmptyState
          icon={<Gauge className="size-6" />}
          title="Belum ada riwayat"
          description="Riwayat muncul setelah guru menjalankan Cek akurasi & kalibrasi di aplikasi (menu Perangkat)."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {summaries.map(summary => (
            <TrendLine key={summary.measure} summary={summary} />
          ))}
          <div className="max-h-[50vh] overflow-auto rounded-lg border border-line">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-card-muted text-fg-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Waktu</th>
                  <th className="px-3 py-2 font-medium">Jenis</th>
                  <th className="px-3 py-2 font-medium">Acuan</th>
                  <th className="px-3 py-2 font-medium">Rata-rata</th>
                  <th className="px-3 py-2 font-medium">Bias</th>
                  <th className="px-3 py-2 font-medium">SD</th>
                  <th className="px-3 py-2 font-medium">Hasil</th>
                  <th className="px-3 py-2 font-medium">Oleh</th>
                </tr>
              </thead>
              <tbody>
                {deviceRows.map(row => {
                  const d = digits(row.measure);
                  const u = row.measure ? unit(row.measure) : '';
                  const isCheck = row.kind === 'check';
                  return (
                    <tr key={row.id} className="border-t border-line">
                      <td className="whitespace-nowrap px-3 py-2">{formatDateTime(row.created_at)}</td>
                      <td className="px-3 py-2">
                        {kindLabel(row.kind)}
                        {row.measure ? ` (${row.measure === 'weight' ? 'berat' : 'tinggi'})` : ''}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {row.reference_value !== null ? `${fixed(row.reference_value, d)} ${u}` : '-'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">{isCheck ? `${fixed(row.mean_value, d)} ${u}` : '-'}</td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {isCheck ? `${signed(row.bias, d)} ${u} (${signed(row.pct_error, 1)}%)` : '-'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">{isCheck ? fixed(row.sd, d + 1) : '-'}</td>
                      <td className="px-3 py-2">
                        {isCheck ? (
                          <Badge tone={row.within_tolerance ? 'success' : 'warning'}>
                            {row.within_tolerance ? 'OK' : 'Di luar'} ±{fixed(row.tolerance, d)}
                          </Badge>
                        ) : (
                          <span title={row.previous_values ? `Sebelum: ${JSON.stringify(row.previous_values)}` : undefined}>
                            <Badge tone={row.result === 'ok' ? 'success' : 'danger'}>{row.result}</Badge>
                            {row.cal_factor !== null ? (
                              <span className="ml-1 text-fg-subtle">
                                faktor {fixed(row.cal_factor, 2)}
                                {row.previous_values?.cal_factor !== undefined
                                  ? ` (dari ${fixed(row.previous_values.cal_factor, 2)})`
                                  : ''}
                              </span>
                            ) : null}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">{row.performed_by ? nameByUser.get(row.performed_by) ?? '-' : '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}

const SOURCE_LABEL = { school: 'khusus sekolah ini', global: 'bawaan semua sekolah', default: 'bawaan aplikasi' } as const;

/** Batas toleransi cek akurasi. Admin sekolah: baris sekolah. Superadmin: baris global. */
export function CalibrationSettingsCard({
  settings,
  history,
}: {
  settings: CalibrationSettings | null;
  history: CalibrationsResult | null;
}) {
  const { can } = useSchoolScope();
  const [editing, setEditing] = useState(false);
  if (!settings) return null;
  const target = can.manageGlobalCalibrationSettings ? 'global' : can.manageCalibrationSettings ? 'school' : null;
  const { effective } = settings;
  const editable = target !== null && settings.available && history?.status !== 'unavailable';

  return (
    <Card>
      <CardHeader
        title="Batas toleransi cek akurasi"
        description={`Dipakai aplikasi saat guru menjalankan Cek akurasi pada alat SmartGrowth (${SOURCE_LABEL[effective.source]}).`}
        actions={
          editable ? (
            <Button size="sm" variant="secondary" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(true)}>
              {target === 'global' ? 'Ubah batas global' : 'Ubah batas sekolah'}
            </Button>
          ) : null
        }
      />
      <div className="flex flex-wrap gap-6 px-5 py-4 text-sm">
        <p>
          Berat: <span className="font-semibold">±{fixed(effective.weightKg, 2)} kg</span>
        </p>
        <p>
          Tinggi: <span className="font-semibold">±{fixed(effective.heightCm, 1)} cm</span>
        </p>
        {!settings.available ? <p className="text-xs text-fg-subtle">Pengaturan belum tersedia di server; memakai bawaan.</p> : null}
      </div>
      {target ? (
        <ToleranceDrawer
          key={editing ? 'open' : 'closed'}
          open={editing}
          target={target}
          initial={
            target === 'global'
              ? settings.globalRow
                ? { weightKg: settings.globalRow.weight_tolerance_kg, heightCm: settings.globalRow.height_tolerance_cm }
                : { weightKg: effective.weightKg, heightCm: effective.heightCm }
              : { weightKg: effective.weightKg, heightCm: effective.heightCm }
          }
          onClose={() => setEditing(false)}
        />
      ) : null}
    </Card>
  );
}

function parsePositive(text: string): number | null {
  const value = Number(text.trim().replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function ToleranceDrawer({
  open,
  target,
  initial,
  onClose,
}: {
  open: boolean;
  target: 'school' | 'global';
  initial: { weightKg: number; heightCm: number };
  onClose: () => void;
}) {
  const { schoolId } = useSchoolScope();
  const toast = useToast();
  const [weight, setWeight] = useState(String(initial.weightKg));
  const [height, setHeight] = useState(String(initial.heightCm));
  const [error, setError] = useState<string | null>(null);
  const mutation = useSchoolMutation((input: { weightKg: number; heightCm: number }, role) =>
    target === 'global' ? saveGlobalTolerances(input, role) : saveSchoolTolerances(schoolId, input, role),
  );

  const onSubmit = async () => {
    setError(null);
    const weightKg = parsePositive(weight);
    const heightCm = parsePositive(height);
    if (weightKg === null || heightCm === null || weightKg > 5 || heightCm > 10) {
      setError('Isi angka lebih dari 0 (berat maks. 5 kg, tinggi maks. 10 cm).');
      return;
    }
    try {
      await mutation.mutateAsync({ weightKg, heightCm });
      toast.success('Batas toleransi disimpan.');
      onClose();
    } catch (submitError) {
      setError(errorMessage(submitError));
    }
  };

  return (
    <Drawer
      open={open}
      title={target === 'global' ? 'Batas toleransi global' : 'Batas toleransi sekolah'}
      description={
        target === 'global'
          ? 'Berlaku untuk semua sekolah yang tidak punya batas sendiri.'
          : 'Berlaku untuk sekolah ini dan menggantikan batas global.'
      }
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
        <FormError message={error} />
        <Field label="Toleransi berat (kg)" hint="Selisih maksimum yang masih dianggap akurat, mis. 0,1.">
          {id => <Input id={id} inputMode="decimal" value={weight} onChange={e => setWeight(e.target.value)} />}
        </Field>
        <Field label="Toleransi tinggi (cm)" hint="Mis. 0,5.">
          {id => <Input id={id} inputMode="decimal" value={height} onChange={e => setHeight(e.target.value)} />}
        </Field>
        <p className="text-xs text-fg-subtle">
          Hasil cek lama tetap memakai batas yang berlaku saat cek dilakukan (tersimpan di tiap hasil).
        </p>
      </div>
    </Drawer>
  );
}

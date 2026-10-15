import type { ReactNode } from 'react';
import { BatteryLow, Bluetooth, RotateCcw } from 'lucide-react';
import { useSchoolScope } from '@/scope/SchoolScope';
import { useSchoolMutation } from '@/hooks/useSchoolData';
import { calibrationsForDevice, useCalibrations } from '@/hooks/useCalibrations';
import { lastActivity, type DeviceView } from '@/hooks/useDevices';
import { resetDeviceCalibrations } from '@/api/crud/calibrations';
import { DEVICE_KIND_LABEL, type DeviceKind, type DeviceRow } from '@/api/crud/devices';
import { PermissionError } from '@/api/errors';
import { formatDateTime, formatNumber, formatRelative } from '@/lib/format';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { DeviceCalibrationHistory } from './DeviceCalibrationSection';
import { DeviceValidationLink } from './DeviceValidationLink';

const RESET_NOT_ALLOWED = 'Reset belum diizinkan di server (perlu update permission).';

/**
 * Konfirmasi + reset log akurasi & kalibrasi satu perangkat. Hanya untuk peran dengan
 * `can.manageDevices` (admin sekolah). Permission backend belum ada → toast jelas, bukan error mentah.
 */
export function useResetDeviceCalibrations() {
  const { can } = useSchoolScope();
  const confirm = useConfirm();
  const toast = useToast();
  const reset = useSchoolMutation((device: DeviceRow, role) => resetDeviceCalibrations(device, role));
  const ask = (device: DeviceRow, name: string, onDone?: () => void) =>
    confirm({
      title: `Reset akurasi & kalibrasi ${name}?`,
      tone: 'danger',
      confirmLabel: 'Reset',
      message:
        'Seluruh log cek akurasi & kalibrasi perangkat ini dihapus permanen. Perangkatnya sendiri tidak diubah (nama, status, dan data pengukuran tetap). Setelah reset, perangkat tampil "belum dicek" sampai guru menjalankan Cek akurasi lagi di aplikasi.',
      onConfirm: async () => {
        try {
          const count = await reset.mutateAsync(device);
          toast.success('Data akurasi & kalibrasi direset.', { description: `${formatNumber(count)} log dihapus.` });
          onDone?.();
        } catch (error) {
          if (error instanceof PermissionError) {
            toast.error(RESET_NOT_ALLOWED);
            return;
          }
          throw error;
        }
      },
    });
  return { canReset: can.manageDevices, ask };
}

function kindLabel(kind: DeviceKind | string | null | undefined): string {
  if (!kind) return '-';
  return DEVICE_KIND_LABEL[kind as DeviceKind] ?? kind;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-fg-subtle">{label}</dt>
      <dd className="break-words text-sm text-fg">{children}</dd>
    </div>
  );
}

/** Detail perangkat: identitas, pemakaian, dan riwayat akurasi & kalibrasi. */
export function DeviceDetailDrawer({
  open,
  row,
  nameByUser,
  onClose,
}: {
  open: boolean;
  row: DeviceView | null;
  nameByUser: Map<string, string>;
  onClose: () => void;
}) {
  const calibrations = useCalibrations();
  const { canReset, ask } = useResetDeviceCalibrations();

  if (!row) return <Drawer open={false} title="" onClose={onClose}>{null}</Drawer>;

  const device = row.device;
  const teachers = (row.usage?.teacherIds ?? []).map(id => nameByUser.get(id) ?? `Pengguna ${id.slice(0, 8)}`);
  const isSmartGrowth = device?.kind === 'smartgrowth';
  const logCount = device ? calibrationsForDevice(calibrations.rows, device).length : 0;
  const pct = device?.battery_pct ?? null;

  return (
    <Drawer
      open={open}
      size="xl"
      title={row.displayName}
      description={
        <span className="inline-flex flex-wrap items-center gap-1.5">
          {kindLabel(row.kind)}
          {!row.registered ? (
            <Badge tone="neutral">Belum terdaftar</Badge>
          ) : row.isActive ? (
            <Badge tone="success">Aktif</Badge>
          ) : (
            <Badge tone="danger">Nonaktif</Badge>
          )}
        </span>
      }
      onClose={onClose}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <DeviceValidationLink deviceId={device?.id} />
          <div className="flex flex-wrap gap-2">
            {canReset && device && isSmartGrowth && calibrations.history?.status === 'ok' ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-danger"
                icon={<RotateCcw className="size-3.5" />}
                disabled={logCount === 0}
                title={logCount === 0 ? 'Belum ada log untuk direset' : undefined}
                onClick={() => void ask(device, row.displayName)}
              >
                Reset akurasi & kalibrasi
              </Button>
            ) : null}
            <Button variant="secondary" size="sm" onClick={onClose}>
              Tutup
            </Button>
          </div>
        </div>
      }
    >
      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-fg">
          <Bluetooth className="size-4 text-brand-500" aria-hidden /> Identitas
        </h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          <Field label="Nama panggilan">{device?.label?.trim() || '-'}</Field>
          <Field label="Nama BLE">{device?.name ?? (row.registered ? '-' : row.displayName)}</Field>
          <Field label="Jenis">{kindLabel(row.kind)}</Field>
          <Field label="ID BLE">
            <span className="font-mono text-xs">{row.bleId ?? '-'}</span>
          </Field>
          <Field label="Serial">
            <span className="font-mono text-xs">{device?.serial ?? '-'}</span>
          </Field>
          <Field label="Firmware">{device?.firmware_version ?? '-'}</Field>
          <Field label="Baterai">
            {pct === null ? (
              '-'
            ) : pct < 20 ? (
              <Badge tone="warning">
                <BatteryLow className="size-3.5" /> {pct}%
              </Badge>
            ) : (
              `${pct}%`
            )}
          </Field>
          <Field label="Pertama terlihat">{formatDateTime(device?.first_seen_at)}</Field>
          <Field label="Terakhir terlihat">
            {formatDateTime(row.lastSeenAt)}
            {row.lastSeenByName ? <span className="block text-xs text-fg-subtle">oleh {row.lastSeenByName}</span> : null}
          </Field>
          {!row.registered ? (
            <div className="col-span-2 sm:col-span-3">
              <p className="text-xs text-fg-subtle">
                Perangkat ini hanya dikenali dari data pengukuran (belum terdaftar di registri). Info serial, baterai, dan status
                muncul setelah perangkat tersambung lagi lewat aplikasi versi terbaru.
              </p>
            </div>
          ) : null}
        </dl>
      </section>

      <section className="mt-6">
        <h3 className="mb-2 text-sm font-semibold text-fg">Pemakaian</h3>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {[
            ['Pengukuran', formatNumber(row.usage?.count ?? 0)],
            ['Terakhir dipakai', row.usage?.lastMeasuredAt ? formatRelative(row.usage.lastMeasuredAt) : '-'],
            ['Aktivitas terakhir', formatDateTime(lastActivity(row))],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-line bg-card-muted/40 px-3 py-2">
              <dt className="text-xs text-fg-subtle">{label}</dt>
              <dd className="mt-0.5 font-semibold tabular-nums text-fg">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-fg-subtle">
          Guru pengguna: {teachers.length > 0 ? teachers.join(', ') : row.usage ? `${row.usage.teacherIds.length} guru` : '-'}
        </p>
      </section>

      {isSmartGrowth ? (
        <section className="mt-6">
          <h3 className="mb-2 text-sm font-semibold text-fg">Akurasi & kalibrasi</h3>
          {calibrations.history?.status === 'unavailable' ? (
            <p className="text-sm text-fg-subtle">Riwayat akurasi belum tersedia di server untuk peran ini.</p>
          ) : (
            <DeviceCalibrationHistory device={device} rows={calibrations.rows} nameByUser={nameByUser} />
          )}
        </section>
      ) : null}
    </Drawer>
  );
}

import { useMemo, useState } from 'react';
import {
  Activity,
  BatteryLow,
  Bluetooth,
  Download,
  FileSpreadsheet,
  FileText,
  Info,
  PauseCircle,
  Pencil,
  PlayCircle,
  Radio,
  Ruler,
  Trash2,
} from 'lucide-react';
import { useSchoolScope } from '@/scope/SchoolScope';
import { useSchoolMutation } from '@/hooks/useSchoolData';
import { useDrawerState } from '@/hooks/useCrud';
import { isSeenWithin, lastActivity, useDevices, type DeviceView } from '@/hooks/useDevices';
import {
  DEVICE_KIND_LABEL,
  deleteDevice,
  setDeviceActive,
  updateDeviceLabel,
  type DeviceKind,
  type DeviceRow,
} from '@/api/crud/devices';
import { errorMessage } from '@/api/errors';
import { formatDate, formatDateTime, formatNumber, formatRelative } from '@/lib/format';
import { dateTimeCell, downloadWorkbook, exportFileName, type ExportFormat } from '@/lib/excel';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, FilterSelect, type Column } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Field, FormError, Input } from '@/components/ui/Form';
import { EmptyState, QueryBoundary } from '@/components/ui/States';
import { RowActions } from '@/components/ui/RowActions';
import { StatCard, StatGrid } from '@/components/ui/StatCard';
import { FadeIn } from '@/components/ui/Animated';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { MenuButton } from '@/components/importExport/MenuButton';
import { useCalibrations } from '@/hooks/useCalibrations';
import { CalibrationSettingsCard, DeviceAccuracyBadge, DeviceCalibrationHistoryModal } from './DeviceCalibrationSection';

const LOW_BATTERY = 20;
const UNREGISTERED_LABEL = 'Belum terdaftar (dari data pengukuran)';

function kindLabel(kind: DeviceKind | string | null | undefined): string {
  if (!kind) return '-';
  return DEVICE_KIND_LABEL[kind as DeviceKind] ?? kind;
}

function teacherNames(row: DeviceView, nameByUser: Map<string, string>): string[] {
  return (row.usage?.teacherIds ?? []).map(id => nameByUser.get(id)).filter((name): name is string => Boolean(name));
}

/**
 * Perangkat BLE sekolah. Admin sekolah: ubah nama, aktif/nonaktif, hapus. Guru & superadmin: baca saja.
 * Perangkat dari data pengukuran yang belum ada di registri (app versi lama) tetap ditampilkan read-only.
 */
export function DevicesPage() {
  const { schoolName, can } = useSchoolScope();
  const { rows, registry, usageTruncated, usageCount, nameByUser, isLoading, error, refetch } = useDevices();
  const toast = useToast();
  const confirm = useConfirm();
  const [kindFilter, setKindFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const renamer = useDrawerState<DeviceRow>();
  const toggle = useSchoolMutation((input: { id: string; active: boolean }, role) => setDeviceActive(input.id, input.active, role));
  const remove = useSchoolMutation((id: string, role) => deleteDevice(id, role));
  const canManage = can.manageDevices && registry?.status === 'ok';
  const calibrations = useCalibrations();
  const [historyFor, setHistoryFor] = useState<{ device: DeviceRow; title: string } | null>(null);

  const filtered = useMemo(
    () =>
      rows.filter(row => {
        if (kindFilter && (row.kind ?? '') !== kindFilter) return false;
        if (statusFilter === 'active' && row.isActive !== true) return false;
        if (statusFilter === 'inactive' && row.isActive !== false) return false;
        if (statusFilter === 'unregistered' && row.registered) return false;
        return true;
      }),
    [rows, kindFilter, statusFilter],
  );

  const stats = useMemo(() => {
    const now = Date.now();
    return {
      total: rows.length,
      unregistered: rows.filter(row => !row.registered).length,
      active: rows.filter(row => row.isActive === true).length,
      inactive: rows.filter(row => row.isActive === false).length,
      recent: rows.filter(row => isSeenWithin(row, 7, now)).length,
      lowBattery: rows.filter(row => row.device?.battery_pct != null && row.device.battery_pct < LOW_BATTERY).length,
    };
  }, [rows]);

  const askToggle = (device: DeviceRow, name: string) => {
    const active = device.is_active;
    void confirm({
      title: active ? `Nonaktifkan ${name}?` : `Aktifkan kembali ${name}?`,
      tone: active ? 'danger' : 'primary',
      confirmLabel: active ? 'Nonaktifkan' : 'Aktifkan',
      message: active
        ? 'Aplikasi MySimoka akan menolak memakai perangkat ini untuk pengukuran sampai diaktifkan kembali. Data pengukuran yang sudah tercatat tidak berubah.'
        : 'Perangkat ini akan kembali bisa dipakai guru untuk pengukuran dari aplikasi MySimoka.',
      onConfirm: async () => {
        await toggle.mutateAsync({ id: device.id, active: !active });
        toast.success(active ? 'Perangkat dinonaktifkan.' : 'Perangkat diaktifkan kembali.');
      },
    });
  };

  const askRemove = (device: DeviceRow, name: string) =>
    void confirm({
      title: `Hapus ${name} dari daftar?`,
      tone: 'danger',
      confirmLabel: 'Hapus',
      message:
        'Perangkat dihapus dari daftar sekolah. Data pengukuran yang pernah dicatat tetap ada. Bila guru menyambungkannya lagi di aplikasi, perangkat akan terdaftar ulang otomatis — untuk memblokir, nonaktifkan saja.',
      onConfirm: async () => {
        await remove.mutateAsync(device.id);
        toast.success('Perangkat dihapus dari daftar.');
      },
    });

  const columns: Column<DeviceView>[] = [
    {
      key: 'name',
      header: 'Perangkat',
      sortValue: row => row.displayName.toLowerCase(),
      cell: row => {
        const sub = [row.device?.label && row.device.name ? row.device.name : null, row.bleId].filter(Boolean).join(' · ');
        return (
          <div className="flex items-center gap-3">
            <span
              className={
                row.registered
                  ? 'flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-500 dark:bg-brand-900/40'
                  : 'flex size-8 shrink-0 items-center justify-center rounded-lg bg-card-muted text-fg-subtle'
              }
            >
              <Bluetooth className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium text-fg">{row.displayName}</p>
              {sub ? <p className="max-w-56 truncate font-mono text-[11px] text-fg-subtle">{sub}</p> : null}
            </div>
          </div>
        );
      },
    },
    { key: 'kind', header: 'Jenis', sortValue: row => kindLabel(row.kind), cell: row => kindLabel(row.kind) },
    {
      key: 'serial',
      header: 'Serial / Firmware',
      sortValue: row => row.device?.serial ?? '',
      cell: row =>
        row.device ? (
          <div className="text-xs">
            <p className="font-mono text-fg">{row.device.serial ?? '-'}</p>
            <p className="text-fg-subtle">{row.device.firmware_version ? `FW ${row.device.firmware_version}` : 'FW -'}</p>
          </div>
        ) : (
          '-'
        ),
    },
    {
      key: 'battery',
      header: 'Baterai',
      sortValue: row => row.device?.battery_pct ?? null,
      cell: row => {
        const pct = row.device?.battery_pct;
        if (pct === null || pct === undefined) return '-';
        return pct < LOW_BATTERY ? (
          <span title="Baterai lemah — segera isi daya / ganti baterai">
            <Badge tone="warning">
              <BatteryLow className="size-3.5" />
              {pct}%
            </Badge>
          </span>
        ) : (
          <span className="tabular-nums">{pct}%</span>
        );
      },
    },
    {
      key: 'lastSeen',
      header: 'Terakhir terlihat',
      sortValue: row => lastActivity(row) ?? '',
      cell: row => {
        const at = row.lastSeenAt ?? row.usage?.lastMeasuredAt ?? null;
        if (!at) return '-';
        return (
          <div className="text-xs" title={formatDateTime(at)}>
            <p className="text-fg">{formatRelative(at)}</p>
            {row.lastSeenByName ? <p className="max-w-40 truncate text-fg-subtle">oleh {row.lastSeenByName}</p> : null}
          </div>
        );
      },
    },
    {
      key: 'firstSeen',
      header: 'Pertama terlihat',
      sortValue: row => row.device?.first_seen_at ?? '',
      cell: row => formatDate(row.device?.first_seen_at),
    },
    {
      key: 'usage',
      header: 'Pemakaian',
      sortValue: row => row.usage?.count ?? 0,
      cell: row => {
        if (!row.usage) return <span className="text-xs text-fg-subtle">Belum dipakai</span>;
        const teachers = teacherNames(row, nameByUser);
        const teacherCount = row.usage.teacherIds.length;
        return (
          <div className="text-xs" title={teachers.length ? `Guru: ${teachers.join(', ')}` : undefined}>
            <p className="font-medium tabular-nums text-fg">{formatNumber(row.usage.count)} pengukuran</p>
            <p className="text-fg-subtle">
              {formatRelative(row.usage.lastMeasuredAt)}
              {teacherCount > 0 ? ` · ${teacherCount} guru` : ''}
            </p>
          </div>
        );
      },
    },
    {
      key: 'accuracy',
      header: 'Akurasi',
      cell: row => {
        const device = row.device;
        if (!device || device.kind !== 'smartgrowth') return <span className="text-xs text-fg-subtle">-</span>;
        return (
          <DeviceAccuracyBadge
            rows={calibrations.rows}
            device={device}
            onOpen={() => setHistoryFor({ device, title: row.displayName })}
          />
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: row => (row.isActive === true ? 0 : row.isActive === false ? 1 : 2),
      cell: row =>
        !row.registered ? (
          <div title={UNREGISTERED_LABEL}>
            <Badge tone="neutral">Belum terdaftar</Badge>
            <p className="mt-0.5 text-[11px] text-fg-subtle">dari data pengukuran</p>
          </div>
        ) : row.isActive ? (
          <Badge tone="success">Aktif</Badge>
        ) : (
          <Badge tone="danger">Nonaktif</Badge>
        ),
    },
    ...(!canManage
      ? []
      : [
          {
            key: 'actions',
            header: '',
            className: 'w-12 text-right',
            cell: (row: DeviceView) => {
              const device = row.device;
              if (!device) return null;
              return (
                <RowActions
                  actions={[
                    { label: 'Ubah nama', icon: <Pencil className="size-4" />, onSelect: () => renamer.show(device) },
                    device.is_active
                      ? { label: 'Nonaktifkan', icon: <PauseCircle className="size-4" />, onSelect: () => askToggle(device, row.displayName) }
                      : { label: 'Aktifkan kembali', icon: <PlayCircle className="size-4" />, onSelect: () => askToggle(device, row.displayName) },
                    {
                      label: 'Hapus dari daftar',
                      icon: <Trash2 className="size-4" />,
                      tone: 'danger' as const,
                      onSelect: () => askRemove(device, row.displayName),
                    },
                  ]}
                />
              );
            },
          },
        ]),
  ];

  const runExport = async (format: ExportFormat) => {
    try {
      const file = exportFileName(schoolName, 'perangkat', format);
      await downloadWorkbook(
        [
          {
            name: 'Perangkat',
            title: `Perangkat BLE — ${schoolName}`,
            info: [
              ['Jumlah perangkat', filtered.length],
              ['Diekspor', formatDateTime(new Date().toISOString())],
            ],
            columns: [
              { header: 'Nama' },
              { header: 'Nama BLE' },
              { header: 'Jenis' },
              { header: 'ID BLE', text: true },
              { header: 'Serial', text: true },
              { header: 'Firmware', text: true },
              { header: 'Baterai (%)', width: 12 },
              { header: 'Status' },
              { header: 'Pertama terlihat', width: 18 },
              { header: 'Terakhir terlihat', width: 18 },
              { header: 'Terakhir terlihat oleh' },
              { header: 'Jumlah pengukuran', width: 18 },
              { header: 'Terakhir dipakai', width: 18 },
              { header: 'Guru pengguna' },
            ],
            rows: filtered.map(row => [
              row.displayName,
              row.device?.name ?? (row.registered ? null : row.displayName),
              kindLabel(row.kind),
              row.bleId,
              row.device?.serial,
              row.device?.firmware_version,
              row.device?.battery_pct ?? null,
              !row.registered ? UNREGISTERED_LABEL : row.isActive ? 'Aktif' : 'Nonaktif',
              dateTimeCell(row.device?.first_seen_at),
              dateTimeCell(row.lastSeenAt),
              row.lastSeenByName,
              row.usage?.count ?? 0,
              dateTimeCell(row.usage?.lastMeasuredAt),
              teacherNames(row, nameByUser).join(', ') || (row.usage?.teacherIds.length ? `${row.usage.teacherIds.length} guru` : null),
            ]),
          },
        ],
        file,
        format,
      );
      toast.success('Ekspor selesai.', { description: file });
    } catch (exportError) {
      toast.error('Ekspor gagal.', { description: errorMessage(exportError) });
    }
  };

  const exportMenu = !can.exportData ? null : (
    <MenuButton
      label="Ekspor"
      icon={<Download className="size-3.5" />}
      sections={[
        {
          items: [
            { key: 'xlsx', icon: <FileSpreadsheet className="size-4" />, label: 'Excel (.xlsx)', onSelect: () => void runExport('xlsx') },
            { key: 'csv', icon: <FileText className="size-4" />, label: 'CSV', onSelect: () => void runExport('csv') },
          ],
        },
      ]}
    />
  );

  const kindOptions = useMemo(() => {
    const present = new Set(rows.map(row => row.kind).filter((kind): kind is string => Boolean(kind)));
    return [
      { value: '', label: 'Semua jenis' },
      ...Object.entries(DEVICE_KIND_LABEL)
        .filter(([value]) => present.has(value))
        .map(([value, label]) => ({ value, label })),
    ];
  }, [rows]);

  return (
    <div>
      <PageHeader
        title="Perangkat"
        description="Timbangan & alat ukur Bluetooth yang dipakai guru lewat aplikasi MySimoka."
      />

      {registry?.status === 'unavailable' ? (
        <FadeIn className="mb-5 flex items-start gap-2 rounded-xl border border-warning/40 bg-[#FFF6E6] px-4 py-3 text-xs text-[#7a5410] dark:bg-warning/10 dark:text-[#f0c774]">
          <Info className="mt-0.5 size-4 shrink-0" />
          <p>
            {registry.reason === 'missing'
              ? 'Daftar perangkat belum tersedia di server. '
              : 'Peran Anda belum diizinkan membaca daftar perangkat. '}
            Data di bawah diturunkan dari riwayat pengukuran via perangkat, sehingga info seperti serial, baterai, dan
            status belum tampil.
          </p>
        </FadeIn>
      ) : null}

      <QueryBoundary isLoading={isLoading} error={error} onRetry={refetch} skeleton="cards">
        {() => (
          <div className="flex flex-col gap-5">
            <StatGrid>
              <StatCard
                label="Total perangkat"
                value={formatNumber(stats.total)}
                hint={stats.unregistered > 0 ? `${stats.unregistered} belum terdaftar` : 'Terdaftar otomatis dari aplikasi'}
                icon={<Bluetooth className="size-4" />}
              />
              <StatCard
                label="Aktif"
                value={formatNumber(stats.active)}
                progress={stats.total - stats.unregistered > 0 ? stats.active / (stats.total - stats.unregistered) : null}
                hint={stats.inactive > 0 ? `${stats.inactive} nonaktif` : stats.lowBattery > 0 ? `${stats.lowBattery} baterai lemah` : undefined}
                icon={<Radio className="size-4" />}
              />
              <StatCard
                label="Terlihat 7 hari terakhir"
                value={formatNumber(stats.recent)}
                hint="Tersambung atau dipakai mengukur"
                icon={<Activity className="size-4" />}
              />
              <StatCard
                label="Pengukuran via perangkat"
                value={formatNumber(usageCount)}
                hint={usageTruncated ? `${formatNumber(usageCount)} data terbaru (dibatasi)` : 'Semua sesi pengukuran sekolah'}
                icon={<Ruler className="size-4" />}
              />
            </StatGrid>

            <CalibrationSettingsCard settings={calibrations.settings} history={calibrations.history} />

            <Card>
              {rows.length === 0 ? (
                <EmptyState
                  icon={<Bluetooth className="size-6" />}
                  title="Belum ada perangkat"
                  description="Perangkat muncul otomatis di sini setelah guru menyambungkan timbangan atau alat ukur Bluetooth di aplikasi MySimoka."
                />
              ) : (
                <DataTable
                  rows={filtered}
                  columns={columns}
                  getRowId={row => row.key}
                  getSearchText={row =>
                    `${row.displayName} ${row.device?.name ?? ''} ${row.device?.serial ?? ''} ${row.bleId ?? ''} ${row.device?.device_key ?? ''}`
                  }
                  searchPlaceholder="Cari nama / serial / ID"
                  initialSort={{ key: 'lastSeen', dir: 'desc' }}
                  emptyTitle="Belum ada perangkat"
                  filters={
                    <>
                      <FilterSelect label="Jenis" value={kindFilter} onChange={setKindFilter} options={kindOptions} />
                      <FilterSelect
                        label="Status"
                        value={statusFilter}
                        onChange={setStatusFilter}
                        options={[
                          { value: '', label: 'Semua status' },
                          { value: 'active', label: 'Aktif' },
                          { value: 'inactive', label: 'Nonaktif' },
                          { value: 'unregistered', label: 'Belum terdaftar' },
                        ]}
                      />
                    </>
                  }
                  actions={exportMenu}
                />
              )}
            </Card>
          </div>
        )}
      </QueryBoundary>

      <RenameDeviceDrawer key={renamer.key} open={renamer.open} device={renamer.target} onClose={renamer.close} />
      <DeviceCalibrationHistoryModal
        open={historyFor !== null}
        device={historyFor?.device ?? null}
        title={historyFor?.title ?? ''}
        rows={calibrations.rows}
        nameByUser={nameByUser}
        onClose={() => setHistoryFor(null)}
      />
    </div>
  );
}

function RenameDeviceDrawer({ open, device, onClose }: { open: boolean; device: DeviceRow | null; onClose: () => void }) {
  const toast = useToast();
  const [label, setLabel] = useState(device?.label ?? '');
  const [error, setError] = useState<string | null>(null);
  const mutation = useSchoolMutation((value: string, role) => (device ? updateDeviceLabel(device.id, value, role) : Promise.resolve()));
  const fallback = device?.name || device?.serial || device?.device_key || 'nama bawaan perangkat';

  const onSubmit = async () => {
    setError(null);
    if (label.trim().length > 60) {
      setError('Nama maksimal 60 karakter.');
      return;
    }
    try {
      await mutation.mutateAsync(label);
      toast.success('Nama perangkat diperbarui.');
      onClose();
    } catch (submitError) {
      setError(errorMessage(submitError));
    }
  };

  return (
    <Drawer
      open={open}
      title="Ubah nama perangkat"
      description={device ? [device.name, device.serial ? `SN ${device.serial}` : null].filter(Boolean).join(' · ') || undefined : undefined}
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
        <Field label="Nama panggilan" hint={`Mis. "Timbangan Kelas 1A". Kosongkan untuk memakai ${fallback}.`}>
          {id => <Input id={id} value={label} maxLength={60} placeholder={fallback} onChange={e => setLabel(e.target.value)} />}
        </Field>
      </div>
    </Drawer>
  );
}

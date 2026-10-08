import { useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ClipboardCheck, FileSpreadsheet, HelpCircle, Printer } from 'lucide-react';
import { useSchoolScope } from '@/scope/SchoolScope';
import { calibrationsForDevice, useCalibrations } from '@/hooks/useCalibrations';
import { deviceDisplayName } from '@/hooks/useDevices';
import { fetchDevices, type DevicesResult } from '@/api/crud/devices';
import type { CalibrationMeasure, CalibrationRow } from '@/api/crud/calibrations';
import { errorMessage } from '@/api/errors';
import { buildAgreementReport, mean, sampleSd, type AgreementReport, type Interval } from '@/lib/agreementStats';
import {
  NO_BATCH,
  batchKey,
  pairsFromChecks,
  selectChecks,
  setupSessions,
  toleranceFromChecks,
  type CheckSelection,
} from '@/lib/deviceValidation';
import { dateTimeCell, downloadWorkbook, exportFileName, numberCell, type CellValue, type SheetSpec } from '@/lib/excel';
import { formatDateTime } from '@/lib/format';
import { Card, CardHeader } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Field, Input, Select } from '@/components/ui/Form';
import { EmptyState, QueryBoundary } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { BlandAltmanChart } from '@/components/charts/BlandAltmanChart';

// ---------------------------------------------------------------------------
// Util tampilan
// ---------------------------------------------------------------------------

const MEASURE_LABEL: Record<CalibrationMeasure, string> = { weight: 'Berat', height: 'Tinggi' };
const UNIT: Record<CalibrationMeasure, string> = { weight: 'kg', height: 'cm' };
const DIGITS: Record<CalibrationMeasure, number> = { weight: 2, height: 1 };

function num(value: number | null | undefined, digits: number): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  return value.toLocaleString('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function signed(value: number | null | undefined, digits: number): string {
  const text = num(value, digits);
  return value !== null && value !== undefined && value > 0 ? `+${text}` : text;
}

function interval(ci: Interval | null | undefined, digits: number): string {
  return ci ? `${num(ci.lower, digits)} s.d. ${num(ci.upper, digits)}` : '-';
}

function pValueText(p: number): string {
  return p < 0.001 ? '< 0,001' : num(p, 3);
}

const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 14mm; }
  :root, .dark {
    --app: #ffffff; --card: #ffffff; --card-muted: #f2f5f8; --fg: #1f2d3d; --fg-muted: #51606f;
    --fg-subtle: #6b7785; --line: #dfe5eb; --line-strong: #cfd8e0; color-scheme: light;
  }
  /* Sembunyikan semua kecuali laporan dan leluhurnya (sidebar, topbar, filter, dll.). */
  body *:not(:has(#laporan-uji-alat)):not(#laporan-uji-alat):not(#laporan-uji-alat *) { display: none !important; }
  *:has(#laporan-uji-alat) {
    display: block !important; position: static !important; transform: none !important; overflow: visible !important;
    height: auto !important; min-height: 0 !important; max-width: none !important; width: auto !important;
    margin: 0 !important; padding: 0 !important; border: 0 !important; box-shadow: none !important; background: #fff !important;
  }
  #laporan-uji-alat { width: 100% !important; }
  #laporan-uji-alat .no-print { display: none !important; }
  #laporan-uji-alat .print-only { display: block !important; }
  #laporan-uji-alat section, #laporan-uji-alat .avoid-break { break-inside: avoid; box-shadow: none !important; }
  #laporan-uji-alat .recharts-responsive-container, #laporan-uji-alat .recharts-wrapper {
    width: 100% !important; height: auto !important; max-width: 100% !important;
  }
  #laporan-uji-alat svg.recharts-surface { width: 100% !important; height: auto !important; }
  #laporan-uji-alat .overflow-auto { overflow: visible !important; max-height: none !important; }
}
`;

// ---------------------------------------------------------------------------
// Data perangkat
// ---------------------------------------------------------------------------

type DeviceOption = { key: string; label: string; sub: string | null; rows: CalibrationRow[] };

function useDeviceOptions(rows: CalibrationRow[]) {
  const { schoolId, role } = useSchoolScope();
  // Kunci query sama dengan useDevices → berbagi cache dengan halaman Perangkat.
  const registry = useQuery({
    queryKey: ['school', schoolId, role, 'devices'],
    queryFn: (): Promise<DevicesResult> => fetchDevices(schoolId, role),
  });
  const options = useMemo<DeviceOption[]>(() => {
    const devices = registry.data?.status === 'ok' ? registry.data.devices : [];
    const matched = new Set<string>();
    const list: DeviceOption[] = [];
    for (const device of devices) {
      const deviceRows = calibrationsForDevice(rows, device);
      for (const row of deviceRows) matched.add(row.id);
      if (!deviceRows.some(row => row.kind === 'check')) continue;
      list.push({
        key: device.id,
        label: deviceDisplayName(device),
        sub: [device.serial ? `SN ${device.serial}` : null, device.ble_id].filter(Boolean).join(' · ') || null,
        rows: deviceRows,
      });
    }
    // Baris yang tidak cocok dengan perangkat terdaftar (registri belum tersedia / perangkat dihapus).
    const orphans = new Map<string, DeviceOption>();
    for (const row of rows) {
      if (matched.has(row.id)) continue;
      const id = row.device_id ?? row.device_key ?? row.ble_id ?? row.device_name ?? 'tanpa-id';
      const key = `log:${id}`;
      const option = orphans.get(key) ?? { key, label: row.device_name ?? row.device_key ?? row.ble_id ?? 'Perangkat tanpa nama', sub: row.ble_id, rows: [] };
      option.rows.push(row);
      orphans.set(key, option);
    }
    for (const option of orphans.values()) if (option.rows.some(row => row.kind === 'check')) list.push(option);
    return list.sort((a, b) => a.label.localeCompare(b.label, 'id'));
  }, [registry.data, rows]);
  return { options, isLoading: registry.isLoading };
}

// ---------------------------------------------------------------------------
// Halaman
// ---------------------------------------------------------------------------

/**
 * Laporan Uji Alat: validasi satu perangkat SmartGrowth terhadap beban/balok acuan bersertifikat
 * yang diukur berulang oleh teknisi saat setup. Semua dihitung di browser dari log cek akurasi.
 */
export function DeviceValidationPage() {
  const { basePath, schoolName, can } = useSchoolScope();
  const toast = useToast();
  const calibrations = useCalibrations();
  const { options, isLoading: devicesLoading } = useDeviceOptions(calibrations.rows);
  const [params, setParams] = useSearchParams();

  const paramDevice = params.get('perangkat') ?? '';
  const deviceKey = options.some(option => option.key === paramDevice) ? paramDevice : (options[0]?.key ?? '');
  const measure: CalibrationMeasure = params.get('ukuran') === 'height' ? 'height' : 'weight';
  const [session, setSession] = useState('latest');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [excludeBefore, setExcludeBefore] = useState(true);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true });
    setSession('latest');
  };

  const device = options.find(option => option.key === deviceKey) ?? null;
  const sessions = useMemo(() => (device ? setupSessions(device.rows, measure, from, to) : []), [device, measure, from, to]);
  const effectiveSession = session === 'latest' || session === 'all' || sessions.some(s => s.key === session) ? session : 'latest';

  const selection = useMemo<CheckSelection | null>(
    () =>
      device
        ? selectChecks(device.rows, { measure, session: effectiveSession, from, to, excludeBeforeAdjustment: excludeBefore })
        : null,
    [device, measure, effectiveSession, from, to, excludeBefore],
  );

  const settingsTolerance =
    calibrations.settings === null
      ? null
      : measure === 'weight'
        ? calibrations.settings.effective.weightKg
        : calibrations.settings.effective.heightCm;

  const toleranceInfo = useMemo(() => {
    const fromChecks = selection ? toleranceFromChecks(selection.usedChecks) : { value: null, mixed: false };
    if (fromChecks.value !== null)
      return { value: fromChecks.value, source: fromChecks.mixed ? 'cek terbaru (toleransi antarcek berbeda)' : 'tersimpan pada cek' };
    return { value: settingsTolerance, source: 'pengaturan sekolah saat ini' };
  }, [selection, settingsTolerance]);

  const report = useMemo<AgreementReport | null>(() => {
    if (!selection) return null;
    return buildAgreementReport(pairsFromChecks(selection.usedChecks), toleranceInfo.value, {
      unit: UNIT[measure],
      digits: DIGITS[measure],
    });
  }, [selection, toleranceInfo.value, measure]);

  const unit = UNIT[measure];
  const d = DIGITS[measure];

  const sessionLabel = (key: string | null) => {
    if (key === null) return 'Semua cek';
    if (key === NO_BATCH) return 'Cek tanpa sesi';
    const found = sessions.find(s => s.key === key);
    return found ? `Sesi ${formatDateTime(found.startedAt)}` : 'Sesi';
  };

  const scopeLines: Array<[string, string]> = [
    ['Sekolah', schoolName],
    ['Perangkat', device ? `${device.label}${device.sub ? ` (${device.sub})` : ''}` : '-'],
    ['Ukuran', `${MEASURE_LABEL[measure]} (${unit})`],
    ['Cakupan', selection ? sessionLabel(selection.sessionKey) : '-'],
    ['Rentang tanggal', from || to ? `${from || 'awal'} s.d. ${to || 'sekarang'}` : 'Semua tanggal'],
    [
      'Cek sebelum kalibrasi',
      excludeBefore ? `Dikecualikan (${selection?.excludedCount ?? 0} cek tidak dipakai)` : 'Ikut dihitung',
    ],
    ['Toleransi', toleranceInfo.value ? `±${num(toleranceInfo.value, d)} ${unit} (${toleranceInfo.source})` : 'Tidak diketahui'],
  ];

  const runExport = async () => {
    if (!report || !selection || !device) return;
    try {
      const file = exportFileName(schoolName, `uji-alat-${measure === 'weight' ? 'berat' : 'tinggi'}`, 'xlsx');
      await downloadWorkbook(buildSheets({ report, selection, scopeLines, measure }), file, 'xlsx');
      toast.success('Ekspor selesai.', { description: file });
    } catch (exportError) {
      toast.error('Ekspor gagal.', { description: errorMessage(exportError) });
    }
  };

  const unavailable = calibrations.history?.status === 'unavailable';

  return (
    <div>
      <style>{PRINT_CSS}</style>
      <PageHeader
        title="Laporan Uji Alat"
        description="Validasi alat SmartGrowth terhadap beban & balok acuan bersertifikat yang diukur berulang saat setup."
        backTo={`${basePath}/perangkat`}
        backLabel="Perangkat"
        actions={
          report && report.pairs.length > 0 ? (
            <>
              {can.exportData ? (
                <Button variant="secondary" size="sm" icon={<FileSpreadsheet className="size-3.5" />} onClick={() => void runExport()}>
                  Excel
                </Button>
              ) : null}
              <Button variant="secondary" size="sm" icon={<Printer className="size-3.5" />} onClick={() => window.print()}>
                Cetak / PDF
              </Button>
            </>
          ) : null
        }
      />

      <QueryBoundary isLoading={calibrations.isLoading || devicesLoading} error={calibrations.error} skeleton="cards">
        {() =>
          unavailable ? (
            <Card>
              <EmptyState
                icon={<ClipboardCheck className="size-6" />}
                title="Riwayat cek akurasi belum tersedia"
                description="Tabel cek akurasi belum tersedia di server atau peran Anda belum diizinkan membacanya."
              />
            </Card>
          ) : options.length === 0 ? (
            <Card>
              <EmptyState
                icon={<ClipboardCheck className="size-6" />}
                title="Belum ada data uji"
                description="Laporan muncul setelah teknisi menjalankan Cek akurasi dengan beban/balok acuan di aplikasi MySimoka."
              />
            </Card>
          ) : (
            <div className="flex flex-col gap-5">
              <Card className="no-print">
                <div className="grid gap-4 px-5 py-4 sm:grid-cols-2 lg:grid-cols-5">
                  <Field label="Perangkat">
                    {id => (
                      <Select id={id} value={deviceKey} onChange={e => setParam('perangkat', e.target.value)}>
                        {options.map(option => (
                          <option key={option.key} value={option.key}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <Field label="Ukuran">
                    {id => (
                      <Select id={id} value={measure} onChange={e => setParam('ukuran', e.target.value)}>
                        <option value="weight">Berat (kg)</option>
                        <option value="height">Tinggi (cm)</option>
                      </Select>
                    )}
                  </Field>
                  <Field label="Sesi setup">
                    {id => (
                      <Select id={id} value={effectiveSession} onChange={e => setSession(e.target.value)}>
                        <option value="latest">Sesi terbaru</option>
                        {sessions.map(s => (
                          <option key={s.key} value={s.key}>
                            {s.key === NO_BATCH ? 'Tanpa sesi' : formatDateTime(s.startedAt)} · {s.checkCount} cek
                          </option>
                        ))}
                        <option value="all">Semua cek</option>
                      </Select>
                    )}
                  </Field>
                  <Field label="Dari tanggal">
                    {id => <Input id={id} type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} />}
                  </Field>
                  <Field label="Sampai tanggal">
                    {id => <Input id={id} type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} />}
                  </Field>
                </div>
                <label className="flex items-start gap-2 border-t border-line px-5 py-3 text-sm text-fg">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-[var(--color-brand-500)]"
                    checked={excludeBefore}
                    onChange={e => setExcludeBefore(e.target.checked)}
                  />
                  <span>
                    Abaikan cek sebelum kalibrasi
                    <span className="block text-xs text-fg-subtle">
                      Bila dalam satu sesi teknisi menyetel ulang alat (tare/kalibrasi {measure === 'weight' ? 'berat' : 'tinggi'}/reset),
                      cek sebelum penyetelan menggambarkan alat lama — hanya cek setelah penyetelan terakhir yang dinilai.
                    </span>
                  </span>
                </label>
              </Card>

              {report && selection ? (
                <ReportBody
                  report={report}
                  selection={selection}
                  scopeLines={scopeLines}
                  measure={measure}
                  unit={unit}
                  d={d}
                />
              ) : null}
            </div>
          )
        }
      </QueryBoundary>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Isi laporan (ikut dicetak)
// ---------------------------------------------------------------------------

function Metric({ label, value, hint }: { label: string; value: ReactNode; hint: string }) {
  return (
    <div className="avoid-break rounded-lg border border-line px-4 py-3">
      <p className="text-xs font-medium text-fg-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-fg">{value}</p>
      <p className="mt-0.5 text-xs text-fg-subtle">{hint}</p>
    </div>
  );
}

function VerdictBanner({ report }: { report: AgreementReport }) {
  const { status, reasons } = report.verdict;
  const tone =
    status === 'layak'
      ? 'border-success/40 bg-[#EAF8F0] text-[#1E874A] dark:bg-success/10 dark:text-[#6fd39a]'
      : status === 'perlu_kalibrasi'
        ? 'border-danger/40 bg-[#FDEEEE] text-[#B42318] dark:bg-danger/10 dark:text-[#f59a9a]'
        : 'border-line bg-card-muted text-fg-muted';
  const icon =
    status === 'layak' ? (
      <CheckCircle2 className="size-5 shrink-0" />
    ) : status === 'perlu_kalibrasi' ? (
      <AlertTriangle className="size-5 shrink-0" />
    ) : (
      <HelpCircle className="size-5 shrink-0" />
    );
  const title = status === 'layak' ? 'Layak' : status === 'perlu_kalibrasi' ? 'Perlu kalibrasi ulang' : 'Tidak cukup data';
  return (
    <div className={`avoid-break flex items-start gap-3 rounded-xl border px-4 py-3 ${tone}`}>
      {icon}
      <div>
        <p className="text-sm font-semibold">Kesimpulan: {title}</p>
        <ul className="mt-1 list-disc pl-4 text-xs">
          {reasons.map(reason => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ReportBody({
  report,
  selection,
  scopeLines,
  measure,
  unit,
  d,
}: {
  report: AgreementReport;
  selection: CheckSelection;
  scopeLines: Array<[string, string]>;
  measure: CalibrationMeasure;
  unit: string;
  d: number;
}) {
  const { bland, errors, proportional, icc, repeat, groups } = report;
  return (
    <div id="laporan-uji-alat" className="flex flex-col gap-5">
      <div className="print-only hidden">
        <h1 className="text-lg font-semibold">Laporan Uji Alat — {MEASURE_LABEL[measure]}</h1>
        <p className="text-xs">Dibuat {formatDateTime(new Date().toISOString())} · MySimoka</p>
      </div>

      <Card>
        <dl className="grid gap-x-6 gap-y-2 px-5 py-4 text-sm sm:grid-cols-2">
          {scopeLines.map(([label, value]) => (
            <div key={label} className="flex gap-2">
              <dt className="w-40 shrink-0 text-fg-subtle">{label}</dt>
              <dd className="text-fg">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {report.pairs.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ClipboardCheck className="size-6" />}
            title="Tidak ada bacaan pada cakupan ini"
            description={
              selection.excludedCount > 0
                ? 'Semua cek pada cakupan ini terjadi sebelum kalibrasi. Matikan "Abaikan cek sebelum kalibrasi" atau pilih sesi lain.'
                : 'Ubah sesi, ukuran, atau rentang tanggal.'
            }
          />
        </Card>
      ) : (
        <>
          <VerdictBanner report={report} />

          <Card>
            <CardHeader title="Ringkasan galat" description="Setiap bacaan dibandingkan langsung dengan nilai acuan bersertifikat." />
            <div className="grid gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
              <Metric
                label="Jumlah bacaan"
                value={`${errors.n} bacaan`}
                hint={`Dari ${groups.length} titik acuan (${selection.usedChecks.length} cek). Tiap bacaan dihitung sebagai satu pasangan.`}
              />
              <Metric
                label="MAE (rata-rata galat absolut)"
                value={`${num(errors.mae, d + 1)} ${unit}`}
                hint="Rata-rata besar selisih bacaan dari acuan, tanpa melihat arah."
              />
              <Metric
                label="MAPE"
                value={`${num(errors.mape, 2)}%`}
                hint="Rata-rata selisih dalam persen dari nilai acuan."
              />
              <Metric
                label="Galat absolut maksimum"
                value={`${num(errors.maxAbsError, d)} ${unit}`}
                hint="Selisih terbesar dari satu bacaan mana pun."
              />
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Kesesuaian Bland–Altman"
              description="Selisih = bacaan − acuan. Batas kesesuaian (LoA) = rentang tempat 95% selisih diperkirakan jatuh."
            />
            {bland ? (
              <>
                <div className="grid gap-3 px-5 pt-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Metric
                    label="Bias (rata-rata selisih)"
                    value={`${signed(bland.bias, d + 1)} ${unit}`}
                    hint={`Kecenderungan alat membaca lebih tinggi (+) atau lebih rendah (−). CI 95%: ${interval(bland.biasCi, d + 1)}.`}
                  />
                  <Metric
                    label="SD selisih"
                    value={`${num(bland.sdDiff, d + 1)} ${unit}`}
                    hint="Seberapa menyebar selisih antar bacaan."
                  />
                  <Metric
                    label="LoA bawah (bias − 1,96·SD)"
                    value={`${signed(bland.loaLower, d + 1)} ${unit}`}
                    hint={`Selisih terendah yang wajar. CI 95%: ${interval(bland.loaLowerCi, d + 1)}.`}
                  />
                  <Metric
                    label="LoA atas (bias + 1,96·SD)"
                    value={`${signed(bland.loaUpper, d + 1)} ${unit}`}
                    hint={`Selisih tertinggi yang wajar. CI 95%: ${interval(bland.loaUpperCi, d + 1)}.`}
                  />
                </div>
                <div className="px-3 pb-4 pt-3 sm:px-5">
                  <BlandAltmanChart pairs={report.pairs} stats={bland} tolerance={report.tolerance} unit={unit} digits={d} />
                </div>
              </>
            ) : (
              <p className="px-5 py-4 text-sm text-fg-subtle">Tidak cukup data (minimal 2 bacaan).</p>
            )}
            <div className="border-t border-line px-5 py-3 text-xs text-fg-muted">
              <p className="font-medium text-fg">Bias proporsional (regresi selisih terhadap acuan)</p>
              {proportional ? (
                <p className="mt-0.5">
                  Kemiringan {signed(proportional.slope, 5)} {unit}/{unit} (CI 95% {interval(proportional.slopeCi, 5)}; p ={' '}
                  {pValueText(proportional.pValue)}) → selisih berubah {signed(proportional.biasChangeOverRange, d + 1)} {unit} dari
                  acuan terkecil ke terbesar.{' '}
                  {proportional.significant ? (
                    <Badge tone="warning">Bermakna: galat tergantung besar beban/tinggi</Badge>
                  ) : (
                    <Badge tone="success">Tidak bermakna</Badge>
                  )}
                </p>
              ) : (
                <p className="mt-0.5">Tidak cukup data (minimal 2 titik acuan berbeda dan 3 bacaan).</p>
              )}
              <p className="mt-0.5 text-fg-subtle">Memeriksa apakah selisih makin besar/kecil seiring nilai acuan (mis. faktor kalibrasi kurang tepat).</p>
            </div>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title="Keandalan uji-ulang (ICC)" description="ICC(2,1) kesepakatan absolut, model dua arah acak." />
              <div className="px-5 py-4 text-sm">
                {icc ? (
                  <>
                    <p className="text-2xl font-semibold tabular-nums text-fg">{num(icc.icc, 3)}</p>
                    <p className="text-xs text-fg-muted">CI 95%: {interval(icc.ci, 3)}</p>
                    <p className="mt-2 text-xs text-fg-muted">
                      {icc.subjects} titik acuan × {icc.k} bacaan.
                      {icc.truncated
                        ? ` Jumlah bacaan per titik tidak sama — dipakai ${icc.k} bacaan pertama tiap titik (minimum bersama).`
                        : ''}
                    </p>
                  </>
                ) : (
                  <p className="text-fg-subtle">Tidak cukup data (minimal 2 titik acuan × 2 bacaan).</p>
                )}
                <p className="mt-2 text-xs text-fg-subtle">
                  Mendekati 1 = bacaan berulang konsisten. Catatan: subjeknya hanya beban/balok acuan, jadi ICC terutama
                  mencerminkan keterulangan dan akan mendekati 1 bila titik acuan berjauhan (mis. 5 vs 30 kg). Jangan dipakai
                  sendirian; nilai utama ada pada LoA dan keterulangan.
                </p>
              </div>
            </Card>
            <Card>
              <CardHeader title="Keterulangan (repeatability)" description="Variasi bacaan berulang pada beban/balok yang sama." />
              <div className="grid gap-3 px-5 py-4 sm:grid-cols-2">
                <Metric
                  label="Sw (SD dalam titik)"
                  value={repeat ? `${num(repeat.sw, d + 1)} ${unit}` : '-'}
                  hint="SD gabungan bacaan berulang di tiap titik acuan."
                />
                <Metric
                  label="Koefisien keterulangan (2,77·Sw)"
                  value={repeat ? `${num(repeat.rc, d + 1)} ${unit}` : '-'}
                  hint="Dua bacaan beruntun pada benda yang sama 95% berbeda tidak lebih dari ini."
                />
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader title="Per titik acuan" />
            <div className="overflow-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-card-muted text-fg-muted">
                  <tr>
                    <th className="px-4 py-2 font-medium">Acuan ({unit})</th>
                    <th className="px-4 py-2 font-medium">Bacaan</th>
                    <th className="px-4 py-2 font-medium">Rata-rata</th>
                    <th className="px-4 py-2 font-medium">Bias</th>
                    <th className="px-4 py-2 font-medium">SD</th>
                    <th className="px-4 py-2 font-medium">Min – maks</th>
                    <th className="px-4 py-2 font-medium">Nilai bacaan</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map(group => {
                    const m = mean(group.readings);
                    return (
                      <tr key={group.reference} className="border-t border-line">
                        <td className="px-4 py-2 font-medium tabular-nums">{num(group.reference, d)}</td>
                        <td className="px-4 py-2 tabular-nums">{group.readings.length}</td>
                        <td className="px-4 py-2 tabular-nums">{num(m, d + 1)}</td>
                        <td className="px-4 py-2 tabular-nums">{signed(m - group.reference, d + 1)}</td>
                        <td className="px-4 py-2 tabular-nums">{num(sampleSd(group.readings), d + 1)}</td>
                        <td className="px-4 py-2 tabular-nums">
                          {num(Math.min(...group.readings), d)} – {num(Math.max(...group.readings), d)}
                        </td>
                        <td className="px-4 py-2 tabular-nums text-fg-muted">{group.readings.map(v => num(v, d)).join('; ')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <p className="text-xs text-fg-subtle">
            Metode: tiap bacaan dipasangkan dengan nilai acuan (acuan dianggap pasti). Bland–Altman (1986, 1999): LoA = bias ±
            1,96·SD; CI bias = bias ± t·SD/√n, CI LoA = LoA ± t·SD·√(3/n), t dengan n−1 derajat bebas. Bias proporsional: regresi
            linier selisih terhadap acuan, uji t kemiringan (α = 0,05). ICC(2,1) menurut Shrout & Fleiss (1979) / McGraw & Wong
            (1996) dengan CI berbasis F. Kesimpulan "Layak" bila kedua LoA di dalam ±toleransi dan tidak ada bias proporsional
            yang bermakna secara statistik sekaligus mengubah bias lebih dari separuh toleransi dari acuan terkecil ke terbesar.
          </p>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Excel
// ---------------------------------------------------------------------------

function buildSheets({
  report,
  selection,
  scopeLines,
  measure,
}: {
  report: AgreementReport;
  selection: CheckSelection;
  scopeLines: Array<[string, string]>;
  measure: CalibrationMeasure;
}): SheetSpec[] {
  const unit = UNIT[measure];
  const d = DIGITS[measure];
  const { bland, errors, proportional, icc, repeat } = report;
  const verdictLabel =
    report.verdict.status === 'layak' ? 'Layak' : report.verdict.status === 'perlu_kalibrasi' ? 'Perlu kalibrasi ulang' : 'Tidak cukup data';
  const metric = (label: string, value: number | null | undefined, digits: number, u: string, note: string): CellValue[] => [
    label,
    numberCell(value ?? null, digits),
    u,
    note,
  ];
  const rows: CellValue[][] = [
    metric('Jumlah bacaan', errors.n, 0, 'bacaan', 'Setiap bacaan = satu pasangan dengan acuan'),
    metric('Jumlah titik acuan', report.groups.length, 0, 'titik', ''),
    metric('Jumlah cek dipakai', selection.usedChecks.length, 0, 'cek', `${selection.excludedCount} cek tidak dipakai`),
    metric('MAE', errors.mae, d + 2, unit, 'Rata-rata |bacaan − acuan|'),
    metric('MAPE', errors.mape, 3, '%', 'Rata-rata |bacaan − acuan| / acuan'),
    metric('Galat absolut maksimum', errors.maxAbsError, d + 1, unit, ''),
    metric('Bias', bland?.bias, d + 2, unit, 'Rata-rata (bacaan − acuan)'),
    metric('CI 95% bias — bawah', bland?.biasCi.lower, d + 2, unit, 'bias ± t·SD/√n'),
    metric('CI 95% bias — atas', bland?.biasCi.upper, d + 2, unit, ''),
    metric('SD selisih', bland?.sdDiff, d + 2, unit, ''),
    metric('LoA bawah', bland?.loaLower, d + 2, unit, 'bias − 1,96·SD'),
    metric('CI 95% LoA bawah — bawah', bland?.loaLowerCi.lower, d + 2, unit, 'LoA ± t·SD·√(3/n)'),
    metric('CI 95% LoA bawah — atas', bland?.loaLowerCi.upper, d + 2, unit, ''),
    metric('LoA atas', bland?.loaUpper, d + 2, unit, 'bias + 1,96·SD'),
    metric('CI 95% LoA atas — bawah', bland?.loaUpperCi.lower, d + 2, unit, ''),
    metric('CI 95% LoA atas — atas', bland?.loaUpperCi.upper, d + 2, unit, ''),
    metric('Kemiringan bias proporsional', proportional?.slope, 6, `${unit}/${unit}`, 'Regresi (bacaan − acuan) terhadap acuan'),
    metric('CI 95% kemiringan — bawah', proportional?.slopeCi.lower, 6, '', ''),
    metric('CI 95% kemiringan — atas', proportional?.slopeCi.upper, 6, '', ''),
    metric('p kemiringan', proportional?.pValue, 4, '', proportional ? (proportional.significant ? 'Bermakna (p < 0,05)' : 'Tidak bermakna') : 'Tidak cukup data'),
    metric('ICC(2,1)', icc?.icc, 4, '', icc ? `${icc.subjects} titik × ${icc.k} bacaan${icc.truncated ? ' (dipotong ke k minimum)' : ''}` : 'Tidak cukup data (min. 2 titik × 2 bacaan)'),
    metric('CI 95% ICC — bawah', icc?.ci?.lower, 4, '', 'Berbasis F (McGraw & Wong 1996)'),
    metric('CI 95% ICC — atas', icc?.ci?.upper, 4, '', ''),
    metric('Sw (SD dalam titik)', repeat?.sw, d + 2, unit, ''),
    metric('Koefisien keterulangan', repeat?.rc, d + 2, unit, '2,77·Sw'),
    metric('Toleransi', report.tolerance, d, unit, ''),
  ];

  const raw: CellValue[][] = [];
  for (const { row, used, reason } of selection.checks) {
    const readings = row.readings ?? [];
    readings.forEach((reading, index) => {
      const diff = row.reference_value !== null ? reading - row.reference_value : null;
      raw.push([
        dateTimeCell(row.created_at),
        batchKey(row) === NO_BATCH ? '-' : row.batch_id,
        row.id,
        numberCell(row.reference_value, d),
        index + 1,
        numberCell(reading, d + 1),
        numberCell(diff, d + 2),
        numberCell(diff === null ? null : Math.abs(diff), d + 2),
        numberCell(diff === null || !row.reference_value ? null : (Math.abs(diff) / row.reference_value) * 100, 3),
        row.result,
        used ? 'Ya' : `Tidak (${reason ?? '-'})`,
      ]);
    });
  }

  return [
    {
      name: 'Ringkasan',
      title: `Laporan Uji Alat — ${MEASURE_LABEL[measure]}`,
      info: [
        ...scopeLines,
        ['Kesimpulan', verdictLabel],
        ...report.verdict.reasons.map((reason, i): [string, CellValue] => [i === 0 ? 'Alasan' : '', reason]),
        ['Dibuat', formatDateTime(new Date().toISOString())],
      ],
      columns: [{ header: 'Metrik', width: 30 }, { header: 'Nilai', width: 14 }, { header: 'Satuan', width: 10 }, { header: 'Keterangan', width: 48 }],
      rows,
    },
    {
      name: 'Per titik acuan',
      columns: [
        { header: `Acuan (${unit})` },
        { header: 'Jumlah bacaan' },
        { header: 'Rata-rata' },
        { header: 'Bias' },
        { header: 'SD' },
        { header: 'Min' },
        { header: 'Maks' },
      ],
      rows: report.groups.map(group => {
        const m = mean(group.readings);
        return [
          numberCell(group.reference, d),
          group.readings.length,
          numberCell(m, d + 2),
          numberCell(m - group.reference, d + 2),
          numberCell(sampleSd(group.readings), d + 2),
          numberCell(Math.min(...group.readings), d + 1),
          numberCell(Math.max(...group.readings), d + 1),
        ];
      }),
    },
    {
      name: 'Bacaan mentah',
      columns: [
        { header: 'Waktu cek', width: 18 },
        { header: 'Sesi (batch_id)', text: true },
        { header: 'ID cek', text: true },
        { header: `Acuan (${unit})` },
        { header: 'Bacaan ke-' },
        { header: `Bacaan (${unit})` },
        { header: `Selisih (${unit})` },
        { header: `|Selisih| (${unit})` },
        { header: 'Galat (%)' },
        { header: 'Hasil cek' },
        { header: 'Dipakai' },
      ],
      rows: raw,
    },
  ];
}

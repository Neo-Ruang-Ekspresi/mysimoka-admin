/**
 * Detail lengkap satu record pengukuran / imunisasi + daftar percobaan di sesi tsb.
 * Dipakai bersama oleh drawer siswa, halaman pertumbuhan siswa, dan detail sesi.
 *
 * Data pendukung (sesi, kelas, siswa, nama pencatat) diambil dari cache React Query yang sama
 * dengan halaman lain → tidak ada fetch tambahan. Percobaan (`attempts`) dioper dari pemanggil
 * karena sumbernya berbeda (per siswa vs per sesi).
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, History, Info } from 'lucide-react';
import { useSchoolScope } from '@/scope/SchoolScope';
import { useClasses, useImmunizationSessions, useMeasurementSessions, useStudents } from '@/hooks/useSchoolData';
import { useMemberNames } from '@/hooks/useRecordHistory';
import { HISTORY_ACTION_LABEL, type HistoryEntry } from '@/api/recordHistory';
import type { ImmunizationRecordRow, MeasurementRecordRow } from '@/api/types';
import { formatReferenceDiff, readReference, referenceDiff } from '@/api/measurementReference';
import { toGrowthPoint } from '@/lib/growthReport';
import { computeBmi } from '@/lib/nutrition';
import { formatDate, formatDateTime, formatDecimal, genderLabel } from '@/lib/format';
import { captureMethodLabel, captureSourceLabel, userLabel } from '@/lib/records';
import { cn } from '@/lib/object';
import { Badge, ImmunizationStatusBadge, type Tone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Skeleton } from '@/components/ui/Skeleton';
import { ReferenceInfo } from '@/components/growth/ReferenceInfo';
import { normalizeSex } from '@/lib/growth';
import { cdcBmiPercentile, cdcCategory } from '@/lib/cdc';
import { BmiStatusBadge, formatAgeMonths, formatZ, HeightStatusBadge, WeightStatusBadge } from '@/pages/school/reports/shared';

export type AttemptsProps = {
  /** Percobaan untuk (sesi, siswa) record ini, terbaru dulu. */
  attempts: HistoryEntry[] | undefined;
  /** false = tabel riwayat belum tersedia di backend / role. */
  historyAvailable: boolean;
  historyLoading?: boolean;
};

/** Badge "3 percobaan" (hanya bila > 1). */
export function AttemptsBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 1) return null;
  return (
    <Badge tone="brand" className={className}>
      <History className="size-3" aria-hidden /> {count} percobaan
    </Badge>
  );
}

/** Baris kecil di sel tabel: nilai pembanding + selisih (kosong bila tidak ada pembanding). */
export function ReferenceNote({ record, kind }: { record: MeasurementRecordRow | null | undefined; kind: 'height' | 'weight' }) {
  const ref = readReference(record);
  const value = kind === 'height' ? ref?.heightCm : ref?.weightKg;
  if (!ref || value == null) return null;
  const unit = kind === 'height' ? 'cm' : 'kg';
  return (
    <span className="block text-xs font-normal text-fg-subtle" title="Data pembanding (selisih = hasil alat − pembanding)">
      pemb. {formatDecimal(value, 2)} ({formatReferenceDiff(kind === 'height' ? ref.heightDiff : ref.weightDiff, unit)})
    </span>
  );
}

function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cn('min-w-0', wide && 'col-span-2 sm:col-span-3')}>
      <dt className="text-xs text-fg-subtle">{label}</dt>
      <dd className="break-words text-sm text-fg">{children}</dd>
    </div>
  );
}

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="mt-6 first:mt-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-fg">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Metric({ label, value, hint }: { label: ReactNode; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-card-muted/40 px-3 py-2.5">
      <div className="text-xs text-fg-subtle">{label}</div>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-fg">{value}</p>
      {hint ? <div className="mt-0.5 text-xs text-fg-subtle">{hint}</div> : null}
    </div>
  );
}

const ACTION_TONE: Record<HistoryEntry['action'], Tone> = { backfill: 'neutral', insert: 'brand', update: 'warning' };

function Delta({ value, unit }: { value: number | null; unit: string }) {
  if (value === null || Math.abs(value) < 0.05) return null;
  return (
    <span className={cn('text-xs tabular-nums', value > 0 ? 'text-success' : 'text-warning')}>
      {value > 0 ? '+' : '−'}
      {formatDecimal(Math.abs(value))} {unit}
    </span>
  );
}

/** Pesan saat riwayat tidak tersedia / kosong. */
function AttemptsFallback({ available, loading }: { available: boolean; loading?: boolean }) {
  if (loading) return <Skeleton className="h-16 w-full" />;
  return (
    <p className="flex items-start gap-2 rounded-lg border border-dashed border-line px-3 py-2.5 text-xs text-fg-subtle">
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      {available
        ? 'Belum ada riwayat percobaan untuk catatan ini (dicatat sebelum riwayat diaktifkan). Nilai di atas adalah nilai resmi yang tersimpan.'
        : 'Riwayat percobaan belum tersedia di server. Hanya nilai terakhir yang tersimpan yang ditampilkan.'}
    </p>
  );
}

function SessionLink({ kind, sessionId, name, hide, onNavigate }: { kind: 'measurement' | 'immunization'; sessionId: string; name: string; hide?: boolean; onNavigate: () => void }) {
  const { basePath } = useSchoolScope();
  if (hide) return <>{name}</>;
  return (
    <Link
      to={`${basePath}/${kind === 'measurement' ? 'pengukuran' : 'imunisasi'}/${sessionId}`}
      onClick={onNavigate}
      className="font-medium text-brand-600 hover:underline dark:text-brand-300"
    >
      {name}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Pengukuran
// ---------------------------------------------------------------------------

export function MeasurementRecordDrawer({
  open,
  record,
  onClose,
  attempts,
  historyAvailable,
  historyLoading,
  hideSessionLink,
}: AttemptsProps & {
  open: boolean;
  record: MeasurementRecordRow | null;
  onClose: () => void;
  /** Sembunyikan tautan sesi (sudah berada di halaman sesi tsb). */
  hideSessionLink?: boolean;
}) {
  const students = useStudents();
  const sessions = useMeasurementSessions();
  const classes = useClasses();
  const names = useMemberNames();

  if (!record) return <Drawer open={false} title="" onClose={onClose}>{null}</Drawer>;

  const view = students.data?.find(item => item.id === record.student_id) ?? null;
  const student = view?.student ?? { gender: null, date_of_birth: null };
  const point = toGrowthPoint(record, student);
  const sex = normalizeSex(student.gender);
  const cdcPercentile = cdcBmiPercentile(point.bmi, sex, point.ageMonths);
  const cdcText = cdcPercentile === null ? '-' : `P${Math.round(cdcPercentile)} · ${cdcCategory(cdcPercentile)}`;
  const infoLabel = (text: string, indicator: 'bmi' | 'height' | 'weight') => (
    <span className="inline-flex items-center gap-1">
      {text} <ReferenceInfo indicator={indicator} sex={sex} months={point.ageMonths} />
    </span>
  );
  const session = sessions.data?.find(item => item.id === record.session_id) ?? null;
  const className = classes.data?.find(item => item.id === session?.class_id)?.name ?? view?.className ?? '-';
  const list = attempts ?? [];
  const lastChange = list[0]?.changedAt ?? null;
  const reference = readReference(record);

  return (
    <Drawer
      open={open}
      size="lg"
      title="Detail pengukuran"
      description={
        <span className="inline-flex flex-wrap items-center gap-1.5">
          {view?.student.full_name ?? `Siswa ${record.student_id.slice(0, 8)}`} · {formatDateTime(record.measured_at)}
          <AttemptsBadge count={list.length} />
        </span>
      }
      onClose={onClose}
      footer={
        <Button variant="secondary" size="sm" onClick={onClose}>
          Tutup
        </Button>
      }
    >
      <Section title="Hasil resmi">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Metric label="Tinggi badan" value={`${formatDecimal(point.heightCm)} cm`} />
          <Metric label="Berat badan" value={`${formatDecimal(point.weightKg)} kg`} />
          <Metric label="IMT" value={formatDecimal(point.bmi)} hint="kg/m² · status: lihat IMT/U" />
          <Metric label={infoLabel('Status gizi (IMT/U)', 'bmi')} value={<BmiStatusBadge status={point.bmiStatus} reason={point.reason} />} hint={`z ${formatZ(point.bmiZ)}`} />
          <Metric label={infoLabel('TB/U', 'height')} value={<HeightStatusBadge status={point.heightStatus} />} hint={`z ${formatZ(point.hfaZ)}`} />
          <Metric
            label={infoLabel('BB/U', 'weight')}
            value={<WeightStatusBadge status={point.weightStatus} reason={point.weightReason} />}
            hint={point.wfaZ !== null ? `z ${formatZ(point.wfaZ)}` : (point.weightReason ?? undefined)}
          />
          <Metric
            label="Jenis kelamin"
            value={<span className="text-base">{genderLabel(student.gender)}</span>}
            hint={sex ? undefined : 'Kosong: z-score tidak dihitung'}
          />
          <Metric
            label="Pembanding CDC 2000"
            value={<span className="text-base">{cdcText}</span>}
            hint="Hanya pembanding; status resmi = IMT/U Permenkes"
          />
          <Metric label="Usia saat ukur" value={<span className="text-base">{formatAgeMonths(point.ageMonths)}</span>} hint={point.reason ?? undefined} />
        </div>
      </Section>

      {reference ? (
        <Section title="Data pembanding">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {reference.heightCm !== null ? (
              <Metric label="Tinggi pembanding" value={`${formatDecimal(reference.heightCm, 2)} cm`} hint={`Selisih ${formatReferenceDiff(reference.heightDiff, 'cm')}`} />
            ) : null}
            {reference.weightKg !== null ? (
              <Metric label="Berat pembanding" value={`${formatDecimal(reference.weightKg, 2)} kg`} hint={`Selisih ${formatReferenceDiff(reference.weightDiff, 'kg')}`} />
            ) : null}
          </div>
          <p className="mt-1.5 text-xs text-fg-subtle">Selisih = hasil alat − pembanding.</p>
        </Section>
      ) : null}

      <Section title="Informasi pencatatan">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          <Field label="Tanggal ukur">{formatDateTime(record.measured_at)}</Field>
          <Field label="Sesi">
            {session ? (
              <SessionLink kind="measurement" sessionId={session.id} name={session.name} hide={hideSessionLink} onNavigate={onClose} />
            ) : (
              '-'
            )}
            {session ? <span className="block text-xs text-fg-subtle">{formatDate(session.session_date)}</span> : null}
          </Field>
          <Field label="Kelas">{className}</Field>
          <Field label="Metode">{captureMethodLabel(record.capture_method)}</Field>
          <Field label="Sumber input">{captureSourceLabel(record.capture_source)}</Field>
          <Field label="Perangkat">{record.device_name ?? '-'}</Field>
          <Field label="Dicatat oleh">{userLabel(names, record.recorded_by)}</Field>
          <Field label="Dibuat">{formatDateTime(record.created_at)}</Field>
          <Field label="Terakhir diubah">{formatDateTime(lastChange ?? record.created_at)}</Field>
          {record.notes ? (
            <Field label="Catatan" wide>
              <span className="whitespace-pre-line">{record.notes}</span>
            </Field>
          ) : null}
        </dl>
      </Section>

      <Section title={`Percobaan di sesi ini${list.length > 0 ? ` (${list.length})` : ''}`}>
        {list.length === 0 ? (
          <AttemptsFallback available={historyAvailable} loading={historyLoading} />
        ) : (
          <ol className="relative">
            {list.map((entry, index) => {
              const older = list[index + 1];
              const bmi = computeBmi(entry.heightCm, entry.weightKg);
              const official = index === 0;
              return (
                <li key={entry.id} className="relative flex gap-3 pb-4 last:pb-0">
                  {index < list.length - 1 ? <span className="absolute left-[7px] top-4 h-full w-px bg-line" aria-hidden /> : null}
                  <span
                    className={cn('relative mt-1 size-[15px] shrink-0 rounded-full border-2 border-card', official ? 'bg-success' : 'bg-line-strong')}
                    aria-hidden
                  />
                  <div
                    className={cn(
                      'min-w-0 flex-1 rounded-lg border px-3 py-2',
                      official ? 'border-success/40 bg-[#EAF8F0]/50 dark:bg-success/10' : 'border-line',
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-semibold text-fg">#{list.length - index}</span>
                      <Badge tone={ACTION_TONE[entry.action]}>{HISTORY_ACTION_LABEL[entry.action]}</Badge>
                      {official ? <Badge tone="success">Dipakai (resmi)</Badge> : null}
                      <span className="ml-auto text-xs text-fg-subtle">{formatDateTime(entry.measuredAt ?? entry.changedAt)}</span>
                    </div>
                    <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm tabular-nums text-fg">
                      <span>
                        TB <b>{formatDecimal(entry.heightCm)}</b> cm{' '}
                        {older ? <Delta value={diff(entry.heightCm, older.heightCm)} unit="cm" /> : null}
                      </span>
                      <span>
                        BB <b>{formatDecimal(entry.weightKg)}</b> kg{' '}
                        {older ? <Delta value={diff(entry.weightKg, older.weightKg)} unit="kg" /> : null}
                      </span>
                      <span>IMT {formatDecimal(bmi)}</span>
                    </p>
                    {entry.referenceHeightCm !== null || entry.referenceWeightKg !== null ? (
                      <p className="mt-0.5 text-xs tabular-nums text-fg-muted">
                        Pembanding
                        {entry.referenceHeightCm !== null
                          ? ` · TB ${formatDecimal(entry.referenceHeightCm, 2)} cm (${formatReferenceDiff(referenceDiff(entry.heightCm, entry.referenceHeightCm), 'cm')})`
                          : ''}
                        {entry.referenceWeightKg !== null
                          ? ` · BB ${formatDecimal(entry.referenceWeightKg, 2)} kg (${formatReferenceDiff(referenceDiff(entry.weightKg, entry.referenceWeightKg), 'kg')})`
                          : ''}
                      </p>
                    ) : null}
                    <p className="mt-0.5 text-xs text-fg-subtle">
                      {userLabel(names, entry.recordedBy)} · {captureSourceLabel(entry.captureSource)}
                      {entry.deviceName ? ` · ${entry.deviceName}` : ''}
                      {entry.action !== 'backfill' && entry.measuredAt && entry.changedAt && entry.measuredAt !== entry.changedAt
                        ? ` · disimpan ${formatDateTime(entry.changedAt)}`
                        : ''}
                    </p>
                    {entry.notes ? <p className="mt-0.5 whitespace-pre-line text-xs text-fg-muted">{entry.notes}</p> : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Section>
    </Drawer>
  );
}

function diff(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : a - b;
}

// ---------------------------------------------------------------------------
// Imunisasi
// ---------------------------------------------------------------------------

export function ImmunizationRecordDrawer({
  open,
  record,
  onClose,
  attempts,
  historyAvailable,
  historyLoading,
  hideSessionLink,
}: AttemptsProps & {
  open: boolean;
  record: ImmunizationRecordRow | null;
  onClose: () => void;
  hideSessionLink?: boolean;
}) {
  const students = useStudents();
  const sessions = useImmunizationSessions();
  const classes = useClasses();
  const names = useMemberNames();

  if (!record) return <Drawer open={false} title="" onClose={onClose}>{null}</Drawer>;

  const view = students.data?.find(item => item.id === record.student_id) ?? null;
  const session = sessions.data?.find(item => item.id === record.session_id) ?? null;
  const className = classes.data?.find(item => item.id === session?.class_id)?.name ?? view?.className ?? '-';
  const list = attempts ?? [];

  return (
    <Drawer
      open={open}
      size="lg"
      title="Detail imunisasi"
      description={
        <span className="inline-flex flex-wrap items-center gap-1.5">
          {view?.student.full_name ?? `Siswa ${record.student_id.slice(0, 8)}`} · {formatDateTime(record.administered_at)}
          <AttemptsBadge count={list.length} />
        </span>
      }
      onClose={onClose}
      footer={
        <Button variant="secondary" size="sm" onClick={onClose}>
          Tutup
        </Button>
      }
    >
      <Section title="Imunisasi">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <p className="text-base font-semibold text-fg">
            {record.vaccine_name}
            {record.dose_label ? <span className="font-normal text-fg-subtle"> · {record.dose_label}</span> : null}
          </p>
          <ImmunizationStatusBadge status={record.status} />
        </div>
        {record.adverse_event_notes?.trim() ? (
          <p className="mb-3 flex items-start gap-2 rounded-lg border border-danger/30 bg-[#FDEEEE] px-3 py-2 text-sm text-[#B42318] dark:bg-danger/15 dark:text-[#f59a9a]">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              <b>KIPI:</b> <span className="whitespace-pre-line">{record.adverse_event_notes}</span>
            </span>
          </p>
        ) : null}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          <Field label="Tanggal pemberian">{formatDateTime(record.administered_at)}</Field>
          <Field label="Sesi">
            {session ? (
              <SessionLink kind="immunization" sessionId={session.id} name={session.name} hide={hideSessionLink} onNavigate={onClose} />
            ) : (
              '-'
            )}
            {session ? <span className="block text-xs text-fg-subtle">{formatDate(session.session_date)}</span> : null}
          </Field>
          <Field label="Kelas">{className}</Field>
          <Field label="Petugas">{record.officer_name ?? session?.officer_name ?? '-'}</Field>
          <Field label="No. batch">{record.batch_number ?? '-'}</Field>
          <Field label="Lokasi suntik">{record.injection_site ?? '-'}</Field>
          <Field label="Metode">{captureMethodLabel(record.capture_method)}</Field>
          <Field label="Dicatat oleh">{userLabel(names, record.recorded_by)}</Field>
          <Field label="Terakhir diubah">{formatDateTime(list[0]?.changedAt ?? null)}</Field>
          {record.notes ? (
            <Field label="Catatan" wide>
              <span className="whitespace-pre-line">{record.notes}</span>
            </Field>
          ) : null}
        </dl>
      </Section>

      <Section title={`Percobaan di sesi ini${list.length > 0 ? ` (${list.length})` : ''}`}>
        {list.length === 0 ? (
          <AttemptsFallback available={historyAvailable} loading={historyLoading} />
        ) : (
          <ol className="relative">
            {list.map((entry, index) => {
              const official = index === 0;
              return (
                <li key={entry.id} className="relative flex gap-3 pb-4 last:pb-0">
                  {index < list.length - 1 ? <span className="absolute left-[7px] top-4 h-full w-px bg-line" aria-hidden /> : null}
                  <span
                    className={cn('relative mt-1 size-[15px] shrink-0 rounded-full border-2 border-card', official ? 'bg-success' : 'bg-line-strong')}
                    aria-hidden
                  />
                  <div
                    className={cn(
                      'min-w-0 flex-1 rounded-lg border px-3 py-2',
                      official ? 'border-success/40 bg-[#EAF8F0]/50 dark:bg-success/10' : 'border-line',
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-semibold text-fg">#{list.length - index}</span>
                      <Badge tone={ACTION_TONE[entry.action]}>{HISTORY_ACTION_LABEL[entry.action]}</Badge>
                      {official ? <Badge tone="success">Dipakai (resmi)</Badge> : null}
                      <span className="ml-auto text-xs text-fg-subtle">{formatDateTime(entry.administeredAt ?? entry.changedAt)}</span>
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-fg">
                      {entry.status ? <ImmunizationStatusBadge status={entry.status} /> : null}
                      <span>
                        {entry.vaccineName ?? record.vaccine_name}
                        {entry.doseLabel ? ` · ${entry.doseLabel}` : ''}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-fg-subtle">
                      {userLabel(names, entry.recordedBy)}
                      {entry.officerName ? ` · petugas ${entry.officerName}` : ''}
                      {entry.batchNumber ? ` · batch ${entry.batchNumber}` : ''}
                      {entry.injectionSite ? ` · ${entry.injectionSite}` : ''}
                    </p>
                    {entry.adverseEventNotes ? <p className="mt-0.5 text-xs text-danger">KIPI: {entry.adverseEventNotes}</p> : null}
                    {entry.notes ? <p className="mt-0.5 whitespace-pre-line text-xs text-fg-muted">{entry.notes}</p> : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Section>
    </Drawer>
  );
}


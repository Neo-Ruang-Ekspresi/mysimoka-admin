import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarDays, HeartPulse, RotateCcw, School, Syringe, TrendingUp } from 'lucide-react';
import { useSchoolScope } from '@/scope/SchoolScope';
import { useReportSource } from '@/hooks/useReports';
import { computeGrowthReport, type ReportFilters } from '@/lib/growthReport';
import { fadeInUp } from '@/lib/motion';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Tabs } from '@/components/ui/Tabs';
import { FilterSelect } from '@/components/ui/DataTable';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { ClassTab, ImmunizationTab, NutritionTab, TrendTab } from './ReportTabs';

type TabKey = 'gizi' | 'kelas' | 'imunisasi' | 'tren';

const DEFAULT_FILTERS: ReportFilters = { academicYearId: '', classId: '', start: '', end: '', coverageDays: 90 };

const COVERAGE_OPTIONS = [30, 60, 90, 180, 365].map(days => ({ value: String(days), label: `Cakupan ${days} hari` }));

const DATE_INPUT =
  'h-9 rounded-lg border border-line-strong bg-card px-2.5 text-sm text-fg focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20';

/** Laporan gizi & imunisasi — admin sekolah, guru, dan drill-down superadmin (read-only). */
export function ReportsPage() {
  const { schoolName } = useSchoolScope();
  const source = useReportSource();
  const [tab, setTab] = useState<TabKey>('gizi');
  const [filters, setFilters] = useState<ReportFilters>(DEFAULT_FILTERS);
  const patch = (next: Partial<ReportFilters>) => setFilters(current => ({ ...current, ...next }));

  const yearOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const year of source.years ?? []) map.set(year.id, year.label ?? `${year.start_year}/${year.end_year}`);
    for (const item of source.classes ?? []) {
      if (item.academic_year && !map.has(item.academic_year.id)) map.set(item.academic_year.id, item.academic_year.label ?? '-');
    }
    return [{ value: '', label: 'Semua tahun ajaran' }, ...[...map.entries()].map(([value, label]) => ({ value, label: `TA ${label}` }))];
  }, [source.years, source.classes]);

  const classOptions = useMemo(
    () => [
      { value: '', label: 'Semua kelas' },
      ...(source.classes ?? [])
        .filter(item => !filters.academicYearId || item.academic_year_id === filters.academicYearId)
        .map(item => ({ value: item.id, label: item.name })),
    ],
    [source.classes, filters.academicYearId],
  );

  const report = useMemo(() => {
    if (
      !source.enrollments ||
      !source.classes ||
      !source.measurementSessions ||
      !source.immunizationSessions ||
      !source.measurementRecords ||
      !source.immunizationRecords
    ) {
      return null;
    }
    return computeGrowthReport({
      filters,
      enrollments: source.enrollments,
      classes: source.classes,
      measurementSessions: source.measurementSessions,
      immunizationSessions: source.immunizationSessions,
      measurementRecords: source.measurementRecords,
      immunizationRecords: source.immunizationRecords,
    });
  }, [
    filters,
    source.enrollments,
    source.classes,
    source.measurementSessions,
    source.immunizationSessions,
    source.measurementRecords,
    source.immunizationRecords,
  ]);

  const dirty = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);

  return (
    <div>
      <PageHeader title="Laporan" description={`Status gizi (WHO 2007 / Permenkes 2/2020), cakupan pengukuran & imunisasi ${schoolName}.`} />

      <Card className="mb-5">
        <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center">
          <FilterSelect
            label="Tahun ajaran"
            value={filters.academicYearId}
            onChange={value => patch({ academicYearId: value, classId: '' })}
            options={yearOptions}
          />
          <FilterSelect label="Kelas" value={filters.classId} onChange={value => patch({ classId: value })} options={classOptions} />
          <div className="flex items-center gap-2">
            <CalendarDays className="size-4 shrink-0 text-fg-subtle" aria-hidden />
            <input
              type="date"
              aria-label="Tanggal mulai"
              className={`${DATE_INPUT} min-w-0 flex-1 sm:flex-none`}
              value={filters.start}
              max={filters.end || undefined}
              onChange={event => patch({ start: event.target.value })}
            />
            <span className="text-xs text-fg-subtle">s.d.</span>
            <input
              type="date"
              aria-label="Tanggal akhir"
              className={`${DATE_INPUT} min-w-0 flex-1 sm:flex-none`}
              value={filters.end}
              min={filters.start || undefined}
              onChange={event => patch({ end: event.target.value })}
            />
          </div>
          <FilterSelect
            label="Jendela cakupan pengukuran"
            value={String(filters.coverageDays)}
            onChange={value => patch({ coverageDays: Number(value) })}
            options={COVERAGE_OPTIONS}
          />
          {dirty ? (
            <Button variant="ghost" size="sm" icon={<RotateCcw className="size-3.5" />} onClick={() => setFilters(DEFAULT_FILTERS)}>
              Reset
            </Button>
          ) : null}
        </div>
      </Card>

      <Tabs<TabKey>
        className="mb-5"
        ariaLabel="Jenis laporan"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'gizi', label: 'Ringkasan gizi', icon: <HeartPulse className="size-4" /> },
          { value: 'kelas', label: 'Per kelas', icon: <School className="size-4" /> },
          { value: 'imunisasi', label: 'Imunisasi', icon: <Syringe className="size-4" /> },
          { value: 'tren', label: 'Tren', icon: <TrendingUp className="size-4" /> },
        ]}
      />

      {source.error ? (
        <Card>
          <ErrorState error={source.error} onRetry={source.refetch} />
        </Card>
      ) : source.isLoading || !report ? (
        <LoadingState label="Menyusun laporan…" variant="dashboard" />
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={tab} variants={fadeInUp} initial="hidden" animate="show" exit="hidden">
            {tab === 'gizi' ? <NutritionTab report={report} /> : null}
            {tab === 'kelas' ? <ClassTab report={report} coverageDays={filters.coverageDays} /> : null}
            {tab === 'imunisasi' ? <ImmunizationTab report={report} /> : null}
            {tab === 'tren' ? <TrendTab report={report} /> : null}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}

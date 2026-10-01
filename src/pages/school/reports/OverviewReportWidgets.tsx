import { useMemo } from 'react';
import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { useSchoolScope } from '@/scope/SchoolScope';
import { useReportSource } from '@/hooks/useReports';
import { computeGrowthReport } from '@/lib/growthReport';
import type { Period } from '@/lib/analytics';
import { formatPercent } from '@/lib/format';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { CoverageBars, StatusDonut } from '@/components/charts/ReportCharts';
import { bmiStatusItems } from './shared';

/**
 * Widget laporan ringkas untuk halaman Ringkasan: donat status gizi WHO + cakupan imunisasi.
 * Memakai cache query yang sama dengan Ringkasan (tanpa fetch tambahan).
 */
export function OverviewReportWidgets({ period }: { period: Period }) {
  const { basePath } = useSchoolScope();
  const source = useReportSource();

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
      filters: { academicYearId: '', classId: '', start: period.start ?? '', end: period.end ?? '', coverageDays: 90 },
      enrollments: source.enrollments,
      classes: source.classes,
      measurementSessions: source.measurementSessions,
      immunizationSessions: source.immunizationSessions,
      measurementRecords: source.measurementRecords,
      immunizationRecords: source.immunizationRecords,
    });
  }, [
    period.start,
    period.end,
    source.enrollments,
    source.classes,
    source.measurementSessions,
    source.immunizationSessions,
    source.measurementRecords,
    source.immunizationRecords,
  ]);

  if (source.error) return null;

  const link = (
    <Link to={`${basePath}/laporan`} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline dark:text-brand-300">
      Laporan lengkap <ArrowRight className="size-3" />
    </Link>
  );

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card>
        <CardHeader
          title="Status gizi (WHO 2007)"
          description={
            report
              ? `IMT/U pengukuran terakhir · stunting ${formatPercent(report.stuntingPrevalence, 1)}`
              : 'IMT/U pengukuran terakhir'
          }
          actions={link}
        />
        <CardBody>
          {report ? (
            <StatusDonut items={bmiStatusItems(report.bmi)} centerLabel="siswa terukur" height={180} emptyTitle="Belum ada pengukuran" />
          ) : (
            <Skeleton className="h-44 w-full rounded-lg" />
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader
          title="Cakupan imunisasi per vaksin"
          description={report ? `${report.immunizedStudents} siswa menerima ≥1 imunisasi · KIPI ${report.adverseEvents}` : 'Per vaksin & dosis'}
          actions={link}
        />
        <CardBody>
          {report ? (
            <CoverageBars
              rows={report.vaccines.slice(0, 6).map(row => ({
                label: row.dose ? `${row.vaccine} · ${row.dose}` : row.vaccine,
                value: row.coverage,
                detail: `${row.given}/${row.target} siswa`,
              }))}
              name="Cakupan"
              labelWidth={120}
              emptyTitle="Belum ada sesi imunisasi"
            />
          ) : (
            <Skeleton className="h-44 w-full rounded-lg" />
          )}
        </CardBody>
      </Card>
    </div>
  );
}

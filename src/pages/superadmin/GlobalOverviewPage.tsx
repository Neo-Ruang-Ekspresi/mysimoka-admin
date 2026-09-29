import { useMemo } from 'react';
import { Building2, ClipboardList, Ruler, School, Syringe, UserCog, Users } from 'lucide-react';
import { formatNumber, formatPercent, monthKey, monthLabel } from '@/lib/format';
import { readNumber } from '@/lib/object';
import { normalizeRoleKey } from '@/lib/roles';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { AverageTrendChart, SimpleBarChart } from '@/components/charts/Charts';
import { useGlobalStats, useRecentMeasurements, useSchoolsOverview } from './useSuperAdmin';
import { SuperAdminNotice } from './SuperAdminNotice';

function oneYearAgoIso(): string {
  const date = new Date();
  date.setMonth(date.getMonth() - 12, 1);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

const SINCE = oneYearAgoIso();

export function GlobalOverviewPage() {
  const stats = useGlobalStats();
  const schools = useSchoolsOverview();
  const recent = useRecentMeasurements(SINCE);

  const monthly = useMemo(() => {
    const buckets = new Map<string, { count: number; heights: number[]; weights: number[] }>();
    for (const record of recent.data ?? []) {
      const key = monthKey(record.measured_at);
      if (!key) continue;
      const entry = buckets.get(key) ?? { count: 0, heights: [], weights: [] };
      entry.count += 1;
      const h = readNumber(record.height_cm);
      const w = readNumber(record.weight_kg);
      if (h !== null) entry.heights.push(h);
      if (w !== null) entry.weights.push(w);
      buckets.set(key, entry);
    }
    const avg = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
    return [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => ({ key, count: entry.count, avgHeight: avg(entry.heights), avgWeight: avg(entry.weights) }));
  }, [recent.data]);

  const topSchools = useMemo(
    () =>
      (schools.data?.schools ?? [])
        .map(school => ({
          label: (school.name ?? '-').slice(0, 18),
          value: school.classes.reduce((sum, item) => sum + (item.student_enrollments_aggregate.aggregate?.count ?? 0), 0),
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10),
    [schools.data],
  );

  const teacherCount = useMemo(
    () =>
      (schools.data?.schools ?? []).reduce(
        (sum, school) => sum + school.school_memberships.filter(item => normalizeRoleKey(item.role) === 'teacher').length,
        0,
      ),
    [schools.data],
  );

  const s = stats.data;
  return (
    <div>
      <PageHeader title="Statistik Global" description="Ringkasan seluruh sekolah yang memakai MySimoka." />
      <SuperAdminNotice />
      {stats.error ? (
        <Card className="mb-5">
          <ErrorState error={stats.error} onRetry={() => void stats.refetch()} />
        </Card>
      ) : stats.isLoading || !s ? (
        <Card className="mb-5">
          <LoadingState />
        </Card>
      ) : (
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Sekolah" value={formatNumber(s.schools)} icon={<Building2 className="size-4" />} />
          <StatCard label="Kelas" value={formatNumber(s.classes)} icon={<School className="size-4" />} />
          <StatCard
            label="Siswa"
            value={formatNumber(s.students)}
            hint={`${formatNumber(s.activeStudents)} aktif`}
            icon={<Users className="size-4" />}
          />
          <StatCard
            label="Pengguna"
            value={formatNumber(s.users)}
            hint={schools.data ? `${formatNumber(teacherCount)} membership guru` : undefined}
            icon={<UserCog className="size-4" />}
          />
          <StatCard
            label="Sesi"
            value={formatNumber(s.measurementSessions + s.immunizationSessions)}
            hint={`${formatNumber(s.measurementSessions)} pengukuran · ${formatNumber(s.immunizationSessions)} imunisasi`}
            icon={<ClipboardList className="size-4" />}
          />
          <StatCard label="Record pengukuran" value={formatNumber(s.measurementRecords)} icon={<Ruler className="size-4" />} />
          <StatCard
            label="Record imunisasi"
            value={formatNumber(s.immunizationRecords)}
            hint={`${formatPercent(s.immunizationRecords ? s.immunizationGiven / s.immunizationRecords : null)} berstatus diberikan`}
            icon={<Syringe className="size-4" />}
          />
          <StatCard
            label="Rata-rata siswa / sekolah"
            value={s.schools ? formatNumber(Math.round(s.activeStudents / s.schools)) : '-'}
            icon={<Users className="size-4" />}
          />
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Record pengukuran per bulan" description="12 bulan terakhir, seluruh sekolah." />
          <CardBody>
            {recent.error ? (
              <ErrorState error={recent.error} onRetry={() => void recent.refetch()} />
            ) : recent.isLoading ? (
              <LoadingState />
            ) : (
              <SimpleBarChart name="Record pengukuran" data={monthly.map(item => ({ label: monthLabel(item.key), value: item.count }))} />
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Sekolah dengan siswa aktif terbanyak" description="10 teratas." />
          <CardBody>
            {schools.error ? (
              <ErrorState error={schools.error} onRetry={() => void schools.refetch()} />
            ) : schools.isLoading ? (
              <LoadingState />
            ) : (
              <SimpleBarChart name="Siswa aktif" data={topSchools} />
            )}
          </CardBody>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Tren rata-rata tinggi badan (global)" description="Rata-rata per bulan seluruh record 12 bulan terakhir." />
          <CardBody>
            {recent.error ? (
              <ErrorState error={recent.error} />
            ) : recent.isLoading ? (
              <LoadingState />
            ) : (
              <AverageTrendChart data={monthly} metric="avgHeight" />
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

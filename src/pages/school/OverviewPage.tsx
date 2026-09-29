import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Activity, ClipboardList, GraduationCap, Ruler, School, Syringe, Users } from 'lucide-react';
import { useSchoolScope } from '@/scope/SchoolScope';
import {
  useAcademicYears,
  useClasses,
  useImmunizationRecords,
  useImmunizationSessions,
  useMeasurementRecords,
  useMeasurementSessions,
  useSchoolMembers,
  useStudents,
} from '@/hooks/useSchoolData';
import { ALL_TIME, academicYearPeriod, computeSchoolAnalytics, type Period } from '@/lib/analytics';
import { formatDate, formatDecimal, formatNumber, formatPercent } from '@/lib/format';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { FilterSelect } from '@/components/ui/DataTable';
import { SessionStatusBadge } from '@/components/ui/Badge';
import { AverageTrendChart, ClassCoverageChart, MonthlyActivityChart, NutritionChart } from '@/components/charts/Charts';

export function OverviewPage() {
  const { schoolName, basePath, mode } = useSchoolScope();
  const students = useStudents();
  const classes = useClasses();
  const members = useSchoolMembers();
  const mSessions = useMeasurementSessions();
  const iSessions = useImmunizationSessions();
  const mRecords = useMeasurementRecords();
  const iRecords = useImmunizationRecords();
  const years = useAcademicYears();
  const [periodKey, setPeriodKey] = useState('all');
  const [trendMetric, setTrendMetric] = useState<'avgHeight' | 'avgWeight'>('avgHeight');

  const periods = useMemo(() => {
    const entries: Array<[string, Period]> = [['all', ALL_TIME]];
    for (const year of years.data ?? []) entries.push([year.id, academicYearPeriod(year)]);
    return new Map(entries);
  }, [years.data]);
  const period = periods.get(periodKey) ?? ALL_TIME;

  const queries = [students, classes, members, mSessions, iSessions, mRecords, iRecords];
  const error = queries.find(query => query.error)?.error;
  const loading = queries.some(query => query.isLoading);

  const analytics = useMemo(() => {
    if (!students.data || !classes.data || !mSessions.data || !iSessions.data || !mRecords.data || !iRecords.data) return null;
    return computeSchoolAnalytics({
      period,
      classes: classes.data,
      students: students.data,
      memberships: members.data ?? [],
      measurementSessions: mSessions.data,
      immunizationSessions: iSessions.data,
      measurementRecords: mRecords.data,
      immunizationRecords: iRecords.data,
    });
  }, [period, students.data, classes.data, members.data, mSessions.data, iSessions.data, mRecords.data, iRecords.data]);

  const recentSessions = useMemo(() => {
    const classNameById = new Map((classes.data ?? []).map(item => [item.id, item.name]));
    const list = [
      ...(mSessions.data ?? []).map(item => ({ ...item, kind: 'pengukuran' as const, label: 'Pengukuran' })),
      ...(iSessions.data ?? []).map(item => ({ ...item, kind: 'imunisasi' as const, label: item.vaccine_name })),
    ];
    return list
      .sort((a, b) => b.session_date.localeCompare(a.session_date))
      .slice(0, 6)
      .map(item => ({ ...item, className: classNameById.get(item.class_id) ?? '-' }));
  }, [mSessions.data, iSessions.data, classes.data]);

  return (
    <div>
      <PageHeader
        title={mode === 'school' ? 'Ringkasan' : 'Ringkasan Sekolah'}
        description={`Kondisi pertumbuhan & imunisasi siswa ${schoolName}.`}
        actions={
          <FilterSelect
            label="Periode"
            value={periodKey}
            onChange={setPeriodKey}
            options={[...periods.entries()].map(([value, item]) => ({ value, label: item.label }))}
          />
        }
      />

      {error ? (
        <Card>
          <ErrorState error={error} onRetry={() => queries.forEach(query => void query.refetch())} />
        </Card>
      ) : loading || !analytics ? (
        <Card>
          <LoadingState label="Menghitung statistik sekolah…" />
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Siswa aktif" value={formatNumber(analytics.totalStudents)} icon={<Users className="size-4" />} />
            <StatCard label="Kelas" value={formatNumber(analytics.totalClasses)} icon={<School className="size-4" />} />
            <StatCard label="Guru" value={formatNumber(analytics.totalTeachers)} icon={<GraduationCap className="size-4" />} />
            <StatCard
              label="Sesi (periode)"
              value={formatNumber(analytics.measurementSessionCount + analytics.immunizationSessionCount)}
              hint={`${analytics.measurementSessionCount} pengukuran · ${analytics.immunizationSessionCount} imunisasi`}
              icon={<ClipboardList className="size-4" />}
            />
            <StatCard
              label="Cakupan pengukuran"
              value={formatPercent(analytics.measurementCoverage)}
              progress={analytics.measurementCoverage}
              hint={`${analytics.measuredStudents} dari ${analytics.totalStudents} siswa terukur`}
              icon={<Ruler className="size-4" />}
            />
            <StatCard
              label="Cakupan imunisasi"
              value={formatPercent(analytics.immunizationCoverage)}
              progress={analytics.immunizationCoverage}
              hint={`${analytics.immunizedStudents} siswa menerima imunisasi`}
              icon={<Syringe className="size-4" />}
            />
            <StatCard
              label="Rata-rata tinggi / berat"
              value={`${formatDecimal(analytics.averageHeight)} cm`}
              hint={`${formatDecimal(analytics.averageWeight)} kg · pengukuran terakhir tiap siswa`}
              icon={<Activity className="size-4" />}
            />
            <StatCard
              label="Rata-rata IMT"
              value={formatDecimal(analytics.averageBmi)}
              hint="kg/m² · pengukuran terakhir tiap siswa"
              icon={<Activity className="size-4" />}
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader title="Aktivitas per bulan" description="Jumlah record pengukuran & imunisasi yang diberikan (12 bulan terakhir dalam periode)." />
              <CardBody>
                <MonthlyActivityChart data={analytics.monthly} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader
                title="Distribusi status gizi"
                description="Kategori IMT dari pengukuran terakhir (ambang sama dengan app mobile)."
              />
              <CardBody>
                <NutritionChart data={analytics.nutrition} />
              </CardBody>
            </Card>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <Card>
              <CardHeader
                title={trendMetric === 'avgHeight' ? 'Tren rata-rata tinggi badan' : 'Tren rata-rata berat badan'}
                description="Rata-rata per bulan dari semua record pengukuran."
                actions={
                  <FilterSelect
                    label="Metrik"
                    value={trendMetric}
                    onChange={value => setTrendMetric(value as 'avgHeight' | 'avgWeight')}
                    options={[
                      { value: 'avgHeight', label: 'Tinggi (cm)' },
                      { value: 'avgWeight', label: 'Berat (kg)' },
                    ]}
                  />
                }
              />
              <CardBody>
                <AverageTrendChart data={analytics.monthly} metric={trendMetric} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Cakupan per kelas" description="Persentase siswa aktif yang sudah diukur / diimunisasi." />
              <CardBody>
                <ClassCoverageChart data={analytics.perClass} />
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader
              title="Sesi terbaru"
              actions={
                <Link to={`${basePath}/pengukuran`} className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-300">
                  Lihat semua sesi
                </Link>
              }
            />
            {recentSessions.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-fg-subtle">Belum ada sesi pengukuran maupun imunisasi.</p>
            ) : (
              <ul className="divide-y divide-line">
                {recentSessions.map(item => (
                  <li key={`${item.kind}-${item.id}`}>
                    <Link
                      to={`${basePath}/${item.kind}/${item.id}`}
                      className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 hover:bg-card-muted/60"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-fg">{item.name}</p>
                        <p className="text-xs text-fg-subtle">
                          {item.label} · {item.className} · {formatDate(item.session_date)}
                        </p>
                      </div>
                      <SessionStatusBadge status={item.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

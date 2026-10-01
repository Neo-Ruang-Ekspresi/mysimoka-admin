import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Activity, AlertTriangle, HeartPulse, Ruler, Syringe, Users } from 'lucide-react';
import { useSchoolScope } from '@/scope/SchoolScope';
import type { ImmunizationRecordStatus } from '@/api/types';
import type { ClassReportRow, GrowthReport, MonthlyTrendRow, StudentStatusRow, VaccineReportRow } from '@/lib/growthReport';
import { BMI_STATUS_COLORS, BMI_STATUS_LABEL, BMI_STATUSES, NOT_COMPUTED_COLOR } from '@/lib/growth';
import { formatDate, formatDecimal, formatNumber, formatPercent, monthLabel } from '@/lib/format';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { StatCard, StatGrid } from '@/components/ui/StatCard';
import { DataTable, FilterSelect, type Column } from '@/components/ui/DataTable';
import { IMMUNIZATION_STATUS_LABEL } from '@/components/ui/Badge';
import {
  CoverageBars,
  MonthlyCountChart,
  StackedStatusBar,
  StatusDonut,
  ZTrendChart,
  type StackSeries,
  type StatusItem,
} from '@/components/charts/ReportCharts';
import { SERIES } from '@/components/charts/Charts';
import { BmiStatusBadge, bmiStatusItems, formatAgeMonths, formatZ, HeightStatusBadge, heightStatusItems, MethodNote } from './shared';

const BMI_SERIES: StackSeries[] = [
  ...BMI_STATUSES.map(key => ({ key, label: BMI_STATUS_LABEL[key], color: BMI_STATUS_COLORS[key] })),
  { key: 'notComputed', label: 'Tidak dihitung', color: NOT_COMPUTED_COLOR },
];

const IMM_STATUS_ORDER: ImmunizationRecordStatus[] = ['given', 'deferred', 'refused', 'absent'];
const IMM_STATUS_COLORS: Record<ImmunizationRecordStatus, string> = {
  given: '#2A9D8F',
  deferred: '#C8841F',
  refused: '#C0392B',
  absent: NOT_COMPUTED_COLOR,
};
const IMM_SERIES: StackSeries[] = IMM_STATUS_ORDER.map(key => ({ key, label: IMMUNIZATION_STATUS_LABEL[key], color: IMM_STATUS_COLORS[key] }));

const vaccineLabel = (row: Pick<VaccineReportRow, 'vaccine' | 'dose'>) => (row.dose ? `${row.vaccine} · ${row.dose}` : row.vaccine);

// ---------------------------------------------------------------------------
// Ringkasan gizi
// ---------------------------------------------------------------------------

type StudentFilter = 'measured' | 'risk' | 'stunting' | 'unmeasured' | 'all';

export function NutritionTab({ report }: { report: GrowthReport }) {
  const { basePath } = useSchoolScope();
  const [filter, setFilter] = useState<StudentFilter>('measured');

  const rows = useMemo(() => {
    return report.students.filter(row => {
      const latest = row.latest;
      switch (filter) {
        case 'measured':
          return !!latest;
        case 'unmeasured':
          return !latest;
        case 'risk':
          return !!latest?.bmiStatus && latest.bmiStatus !== 'gizi_baik';
        case 'stunting':
          return latest?.heightStatus === 'pendek' || latest?.heightStatus === 'sangat_pendek';
        default:
          return true;
      }
    });
  }, [report.students, filter]);

  const columns = useMemo<Column<StudentStatusRow>[]>(
    () => [
      {
        key: 'name',
        header: 'Siswa',
        sortValue: row => row.student.student.full_name,
        cell: row => (
          <Link to={`${basePath}/siswa/${row.student.id}`} className="font-medium text-fg hover:text-brand-600 hover:underline dark:hover:text-brand-300">
            {row.student.student.full_name}
          </Link>
        ),
      },
      { key: 'class', header: 'Kelas', sortValue: row => row.student.className, cell: row => row.student.className },
      { key: 'date', header: 'Tgl ukur', sortValue: row => row.latest?.date ?? null, cell: row => formatDate(row.latest?.date) },
      { key: 'age', header: 'Usia', sortValue: row => row.latest?.ageMonths ?? null, cell: row => formatAgeMonths(row.latest?.ageMonths) },
      {
        key: 'hw',
        header: 'TB / BB',
        cell: row => (row.latest ? `${formatDecimal(row.latest.heightCm)} cm · ${formatDecimal(row.latest.weightKg)} kg` : '-'),
      },
      { key: 'bmi', header: 'IMT', sortValue: row => row.latest?.bmi ?? null, cell: row => formatDecimal(row.latest?.bmi), className: 'tabular-nums' },
      { key: 'bmiz', header: 'z IMT/U', sortValue: row => row.latest?.bmiZ ?? null, cell: row => formatZ(row.latest?.bmiZ), className: 'tabular-nums' },
      {
        key: 'bmis',
        header: 'Status gizi',
        sortValue: row => (row.latest?.bmiStatus ? BMI_STATUSES.indexOf(row.latest.bmiStatus) : null),
        cell: row => (row.latest ? <BmiStatusBadge status={row.latest.bmiStatus} reason={row.latest.reason} /> : <span className="text-xs text-fg-subtle">Belum diukur</span>),
      },
      { key: 'hfaz', header: 'z TB/U', sortValue: row => row.latest?.hfaZ ?? null, cell: row => formatZ(row.latest?.hfaZ), className: 'tabular-nums' },
      { key: 'hfas', header: 'TB/U', cell: row => <HeightStatusBadge status={row.latest?.heightStatus ?? null} /> },
    ],
    [basePath],
  );

  return (
    <div className="flex flex-col gap-5">
      <StatGrid>
        <StatCard label="Siswa dalam cakupan" value={formatNumber(report.totalStudents)} icon={<Users className="size-4" />} />
        <StatCard
          label="Terukur (periode)"
          value={formatNumber(report.measuredStudents)}
          hint={`${formatNumber(report.computedStudents)} dengan z-score terhitung`}
          progress={report.totalStudents > 0 ? report.measuredStudents / report.totalStudents : null}
          icon={<Ruler className="size-4" />}
        />
        <StatCard
          label="Gizi kurang + buruk"
          value={formatPercent(report.thinPrevalence, 1)}
          hint={`IMT/U z < −2 · ${formatNumber(report.bmi.gizi_kurang + report.bmi.gizi_buruk)} siswa`}
          icon={<AlertTriangle className="size-4" />}
        />
        <StatCard
          label="Stunting (pendek + sangat pendek)"
          value={formatPercent(report.stuntingPrevalence, 1)}
          hint={`TB/U z < −2 · ${formatNumber(report.height.pendek + report.height.sangat_pendek)} siswa`}
          icon={<Ruler className="size-4" />}
        />
        <StatCard
          label="Gizi lebih + obesitas"
          value={formatPercent(report.overPrevalence, 1)}
          hint={`IMT/U z > +1 · ${formatNumber(report.bmi.gizi_lebih + report.bmi.obesitas)} siswa`}
          icon={<HeartPulse className="size-4" />}
        />
        <StatCard label="Rata-rata z IMT/U" value={formatZ(report.avgBmiZ)} hint={`Rata-rata z TB/U ${formatZ(report.avgHfaZ)}`} icon={<Activity className="size-4" />} animateValue={false} />
      </StatGrid>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Status gizi (IMT/U)" description="Pengukuran terakhir tiap siswa dalam periode." />
          <CardBody>
            <StatusDonut items={bmiStatusItems(report.bmi)} centerLabel="siswa terukur" emptyTitle="Belum ada pengukuran" />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Tinggi badan menurut umur (TB/U)" description="Indikator stunting dari pengukuran terakhir." />
          <CardBody>
            <StatusDonut items={heightStatusItems(report.height)} centerLabel="siswa terukur" emptyTitle="Belum ada pengukuran" />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Status per siswa" description="Klik nama siswa untuk melihat grafik pertumbuhan." />
        <DataTable
          rows={rows}
          columns={columns}
          getRowId={row => row.student.id}
          getSearchText={row => `${row.student.student.full_name} ${row.student.student.student_number ?? ''} ${row.student.className}`}
          searchPlaceholder="Cari siswa / kelas…"
          filters={
            <FilterSelect
              label="Filter siswa"
              value={filter}
              onChange={value => setFilter(value as StudentFilter)}
              options={[
                { value: 'measured', label: 'Sudah diukur' },
                { value: 'risk', label: 'Status gizi tidak normal' },
                { value: 'stunting', label: 'Pendek / sangat pendek' },
                { value: 'unmeasured', label: 'Belum diukur' },
                { value: 'all', label: 'Semua siswa' },
              ]}
            />
          }
          emptyTitle="Tidak ada siswa"
          initialSort={{ key: 'bmiz', dir: 'asc' }}
        />
      </Card>

      <MethodNote>
        Z-score dihitung dengan referensi WHO Growth Reference 2007 (5–19 th; parameter LMS bulanan, interpolasi usia,
        koreksi z &gt; |3| untuk IMT/U seperti paket resmi WHO <i>anthroplus</i>). Kategori mengikuti Permenkes No. 2/2020:
        gizi buruk z &lt; −3, gizi kurang −3 s.d. &lt; −2, gizi baik −2 s.d. +1, gizi lebih &gt; +1 s.d. +2, obesitas &gt; +2;
        TB/U pendek z &lt; −2, sangat pendek z &lt; −3. Usia &lt; 5 th (standar WHO 2006) dan data tanpa tanggal lahir/jenis
        kelamin tidak dihitung. Prevalensi = jumlah kategori / siswa dengan z-score terhitung.
      </MethodNote>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per kelas
// ---------------------------------------------------------------------------

export function ClassTab({ report, coverageDays }: { report: GrowthReport; coverageDays: number }) {
  const stackRows = useMemo(
    () =>
      report.classes
        .filter(row => row.measured > 0)
        .map(row => ({ label: row.className, ...row.bmi })),
    [report.classes],
  );

  const columns = useMemo<Column<ClassReportRow>[]>(
    () => [
      { key: 'name', header: 'Kelas', sortValue: row => row.className, cell: row => <span className="font-medium text-fg">{row.className}</span> },
      { key: 'students', header: 'Siswa', sortValue: row => row.students, cell: row => formatNumber(row.students), className: 'tabular-nums' },
      {
        key: 'coverage',
        header: `Cakupan ${coverageDays} hr`,
        sortValue: row => row.coverage,
        cell: row => `${formatPercent(row.coverage)} (${row.measuredRecent})`,
        className: 'tabular-nums',
      },
      { key: 'h', header: 'Rata TB', sortValue: row => row.avgHeight, cell: row => (row.avgHeight ? `${formatDecimal(row.avgHeight)} cm` : '-'), className: 'tabular-nums' },
      { key: 'w', header: 'Rata BB', sortValue: row => row.avgWeight, cell: row => (row.avgWeight ? `${formatDecimal(row.avgWeight)} kg` : '-'), className: 'tabular-nums' },
      { key: 'z', header: 'Rata z IMT/U', sortValue: row => row.avgBmiZ, cell: row => formatZ(row.avgBmiZ), className: 'tabular-nums' },
      {
        key: 'thin',
        header: 'Kurang+buruk',
        sortValue: row => row.bmi.gizi_kurang + row.bmi.gizi_buruk,
        cell: row => formatNumber(row.bmi.gizi_kurang + row.bmi.gizi_buruk),
        className: 'tabular-nums',
      },
      {
        key: 'over',
        header: 'Lebih+obesitas',
        sortValue: row => row.bmi.gizi_lebih + row.bmi.obesitas,
        cell: row => formatNumber(row.bmi.gizi_lebih + row.bmi.obesitas),
        className: 'tabular-nums',
      },
      {
        key: 'stunted',
        header: 'Stunting',
        sortValue: row => row.stunted,
        cell: row => `${row.stunted}${row.hfaComputed > 0 ? ` (${formatPercent(row.stunted / row.hfaComputed)})` : ''}`,
        className: 'tabular-nums',
      },
      { key: 'imm', header: 'Imunisasi', sortValue: row => row.immunizedPct, cell: row => formatPercent(row.immunizedPct), className: 'tabular-nums' },
    ],
    [coverageDays],
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title="Status gizi per kelas" description="Proporsi kategori IMT/U dari pengukuran terakhir siswa terukur." />
          <CardBody>
            <StackedStatusBar rows={stackRows} series={BMI_SERIES} percent emptyTitle="Belum ada kelas dengan pengukuran" />
          </CardBody>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title={`Cakupan pengukuran ${coverageDays} hari`} description="Siswa yang diukur minimal sekali dalam jendela ini / siswa kelas." />
          <CardBody>
            <CoverageBars
              rows={report.classes.map(row => ({ label: row.className, value: row.coverage, detail: `${row.measuredRecent}/${row.students} siswa` }))}
              name="Cakupan"
              labelWidth={90}
              emptyTitle="Belum ada kelas"
            />
          </CardBody>
        </Card>
      </div>
      <Card>
        <CardHeader title="Ringkasan per kelas" description="Rata-rata TB/BB & z dari pengukuran terakhir tiap siswa." />
        <DataTable
          rows={report.classes}
          columns={columns}
          getRowId={row => row.classId}
          getSearchText={row => row.className}
          searchPlaceholder="Cari kelas…"
          emptyTitle="Belum ada kelas"
          initialSort={{ key: 'name', dir: 'asc' }}
          initialPageSize={25}
        />
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Imunisasi
// ---------------------------------------------------------------------------

export function ImmunizationTab({ report }: { report: GrowthReport }) {
  const statusItems: StatusItem[] = IMM_STATUS_ORDER.map(key => ({
    key,
    label: IMMUNIZATION_STATUS_LABEL[key],
    color: IMM_STATUS_COLORS[key],
    count: report.immunizationStatus[key],
  }));
  const totalRecords = statusItems.reduce((sum, item) => sum + item.count, 0);

  const columns = useMemo<Column<VaccineReportRow>[]>(
    () => [
      { key: 'v', header: 'Vaksin / dosis', sortValue: row => vaccineLabel(row), cell: row => <span className="font-medium text-fg">{vaccineLabel(row)}</span> },
      { key: 'target', header: 'Sasaran', sortValue: row => row.target, cell: row => formatNumber(row.target), className: 'tabular-nums' },
      { key: 'given', header: 'Diberikan', sortValue: row => row.given, cell: row => formatNumber(row.given), className: 'tabular-nums' },
      { key: 'cov', header: 'Cakupan', sortValue: row => row.coverage, cell: row => formatPercent(row.coverage, 1), className: 'tabular-nums' },
      ...IMM_STATUS_ORDER.filter(key => key !== 'given').map<Column<VaccineReportRow>>(key => ({
        key,
        header: IMMUNIZATION_STATUS_LABEL[key],
        sortValue: row => row.status[key],
        cell: row => formatNumber(row.status[key]),
        className: 'tabular-nums',
      })),
      {
        key: 'kipi',
        header: 'KIPI',
        sortValue: row => row.adverse,
        cell: row => (row.adverse > 0 ? <span className="font-medium text-danger">{row.adverse}</span> : '0'),
        className: 'tabular-nums',
      },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-5">
      <StatGrid>
        <StatCard
          label="Siswa menerima imunisasi"
          value={formatNumber(report.immunizedStudents)}
          progress={report.immunizationCoverage}
          hint={`${formatPercent(report.immunizationCoverage)} dari ${formatNumber(report.totalStudents)} siswa`}
          icon={<Syringe className="size-4" />}
        />
        <StatCard label="Jenis vaksin / dosis" value={formatNumber(report.vaccines.length)} icon={<Activity className="size-4" />} />
        <StatCard label="Record imunisasi" value={formatNumber(totalRecords)} hint={`${formatNumber(report.immunizationStatus.given)} diberikan`} icon={<Users className="size-4" />} />
        <StatCard label="KIPI dilaporkan" value={formatNumber(report.adverseEvents)} hint="Record dengan catatan KIPI" icon={<AlertTriangle className="size-4" />} />
      </StatGrid>

      <div className="grid gap-5 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title="Cakupan per vaksin & dosis" description="Siswa unik berstatus diberikan / siswa kelas sasaran (kelas yang punya sesi vaksin tsb.)." />
          <CardBody>
            <CoverageBars
              rows={report.vaccines.map(row => ({ label: vaccineLabel(row), value: row.coverage, detail: `${row.given}/${row.target} siswa` }))}
              name="Cakupan"
              labelWidth={130}
              color={SERIES.primary}
              emptyTitle="Belum ada sesi imunisasi"
            />
          </CardBody>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Status record" description="Semua record imunisasi dalam filter." />
          <CardBody>
            <StatusDonut items={statusItems} centerLabel="record" emptyTitle="Belum ada record imunisasi" />
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Status per vaksin" description="Jumlah record per status." />
          <CardBody>
            <StackedStatusBar
              rows={report.vaccines.map(row => ({ label: vaccineLabel(row), ...row.status }))}
              series={IMM_SERIES}
              labelWidth={130}
              emptyTitle="Belum ada record imunisasi"
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Cakupan imunisasi per kelas" description="Siswa dengan ≥1 imunisasi diberikan / siswa kelas." />
          <CardBody>
            <CoverageBars
              rows={report.classes.map(row => ({ label: row.className, value: row.immunizedPct, detail: `${row.immunized}/${row.students} siswa` }))}
              name="Cakupan imunisasi"
              labelWidth={90}
              color={SERIES.secondary}
              emptyTitle="Belum ada kelas"
            />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Rincian per vaksin" />
        <DataTable
          rows={report.vaccines}
          columns={columns}
          getRowId={row => row.key}
          getSearchText={row => vaccineLabel(row)}
          searchPlaceholder="Cari vaksin…"
          emptyTitle="Belum ada data imunisasi"
          initialSort={{ key: 'v', dir: 'asc' }}
        />
      </Card>
      <MethodNote>
        Cakupan = siswa unik berstatus “diberikan” ÷ siswa terdaftar di kelas yang memiliki sesi vaksin+dosis tersebut
        (sesi dibatalkan diabaikan). KIPI = record dengan catatan kejadian ikutan pasca-imunisasi terisi.
      </MethodNote>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tren
// ---------------------------------------------------------------------------

export function TrendTab({ report }: { report: GrowthReport }) {
  const columns = useMemo<Column<MonthlyTrendRow>[]>(
    () => [
      { key: 'm', header: 'Bulan', sortValue: row => row.key, cell: row => <span className="font-medium text-fg">{monthLabel(row.key)}</span> },
      { key: 'n', header: 'Record', sortValue: row => row.measurements, cell: row => formatNumber(row.measurements), className: 'tabular-nums' },
      { key: 's', header: 'Siswa', sortValue: row => row.students, cell: row => formatNumber(row.students), className: 'tabular-nums' },
      { key: 'bz', header: 'Rata z IMT/U', sortValue: row => row.avgBmiZ, cell: row => formatZ(row.avgBmiZ), className: 'tabular-nums' },
      { key: 'hz', header: 'Rata z TB/U', sortValue: row => row.avgHfaZ, cell: row => formatZ(row.avgHfaZ), className: 'tabular-nums' },
      { key: 'thin', header: 'Kurang+buruk', sortValue: row => row.thinPct, cell: row => formatPercent(row.thinPct, 1), className: 'tabular-nums' },
      { key: 'over', header: 'Lebih+obesitas', sortValue: row => row.overPct, cell: row => formatPercent(row.overPct, 1), className: 'tabular-nums' },
    ],
    [],
  );
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Pengukuran per bulan" description="Jumlah record pengukuran (sesi tidak dibatalkan)." />
          <CardBody>
            <MonthlyCountChart data={report.monthly.map(row => ({ key: row.key, value: row.measurements }))} name="Pengukuran" />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Rata-rata z-score per bulan" description="Semua record bulan tsb. yang z-score-nya terhitung." />
          <CardBody>
            <ZTrendChart data={report.monthly} />
          </CardBody>
        </Card>
      </div>
      <Card>
        <CardHeader title="Tabel tren bulanan" />
        <DataTable
          rows={report.monthly}
          columns={columns}
          getRowId={row => row.key}
          emptyTitle="Belum ada pengukuran"
          initialSort={{ key: 'm', dir: 'desc' }}
          initialPageSize={25}
        />
      </Card>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { motion } from 'motion/react';
import { AlertTriangle, Cake, Ruler, Scale, Syringe, UserRound } from 'lucide-react';
import { useSchoolScope } from '@/scope/SchoolScope';
import { useStudents } from '@/hooks/useSchoolData';
import { useStudentHistory } from '@/hooks/useReports';
import { toGrowthPoint, type GrowthPoint } from '@/lib/growthReport';
import { normalizeSex, referenceCurve } from '@/lib/growth';
import { formatDate, formatDecimal, genderLabel, initials } from '@/lib/format';
import { staggerContainer, staggerItem } from '@/lib/motion';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { StatCard, StatGrid } from '@/components/ui/StatCard';
import { Tabs } from '@/components/ui/Tabs';
import { Badge, ImmunizationStatusBadge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { tableRowVariants } from '@/components/ui/Animated';
import { MeasureLineChart, ReferenceBandChart } from '@/components/charts/ReportCharts';
import { SERIES } from '@/components/charts/Charts';
import { BmiStatusBadge, formatAgeMonths, formatZ, HeightStatusBadge, MethodNote } from './shared';

type RefTab = 'bmi' | 'height';

/** Halaman pertumbuhan satu siswa: `${basePath}/siswa/:studentId`. */
export function StudentGrowthPage() {
  const { studentId } = useParams();
  const { basePath } = useSchoolScope();
  const students = useStudents();
  const history = useStudentHistory(studentId);
  const [refTab, setRefTab] = useState<RefTab>('bmi');

  const view = useMemo(() => students.data?.find(item => item.id === studentId) ?? null, [students.data, studentId]);
  const student = view?.student ?? null;
  const sex = normalizeSex(student?.gender);

  const points = useMemo<GrowthPoint[]>(() => {
    if (!student || !history.measurements) return [];
    const cancelled = new Set((history.measurementSessions ?? []).filter(item => item.status === 'cancelled').map(item => item.id));
    return history.measurements
      .filter(record => !cancelled.has(record.session_id))
      .map(record => toGrowthPoint(record, student))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [student, history.measurements, history.measurementSessions]);

  const latest = points.length > 0 ? points[points.length - 1] : null;

  const reference = useMemo(() => {
    const plotted = points.filter(point => point.ageMonths !== null && (refTab === 'bmi' ? point.bmiZ !== null : point.hfaZ !== null));
    if (!sex || plotted.length === 0) return { curve: [], points: [] };
    const ages = plotted.map(point => point.ageMonths!);
    const from = Math.min(...ages) - 6;
    const to = Math.max(...ages) + 6;
    return {
      curve: referenceCurve(refTab, sex, from, to),
      points: plotted.map(point => ({
        months: point.ageMonths!,
        value: (refTab === 'bmi' ? point.bmi : point.heightCm)!,
        date: point.date,
      })),
    };
  }, [points, refTab, sex]);

  const immunizations = history.immunizations ?? [];
  const loading = students.isLoading || history.isLoading;
  const error = students.error ?? history.error;

  if (error) {
    return (
      <div>
        <PageHeader title="Pertumbuhan siswa" backTo={`${basePath}/siswa`} backLabel="Daftar siswa" />
        <Card>
          <ErrorState error={error} onRetry={() => { void students.refetch(); history.refetch(); }} />
        </Card>
      </div>
    );
  }
  if (loading) {
    return (
      <div>
        <PageHeader title="Pertumbuhan siswa" backTo={`${basePath}/siswa`} backLabel="Daftar siswa" />
        <LoadingState variant="dashboard" label="Memuat riwayat siswa…" />
      </div>
    );
  }
  if (!view || !student) {
    return (
      <div>
        <PageHeader title="Pertumbuhan siswa" backTo={`${basePath}/siswa`} backLabel="Daftar siswa" />
        <Card>
          <EmptyState title="Siswa tidak ditemukan" description="Siswa tidak terdaftar di sekolah ini atau sudah dihapus." />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Pertumbuhan siswa" backTo={`${basePath}/siswa`} backLabel="Daftar siswa" />

      <Card className="mb-5">
        <div className="flex flex-wrap items-center gap-4 px-5 py-4">
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex size-14 shrink-0 items-center justify-center rounded-full bg-brand-100 text-lg font-semibold text-brand-700 dark:bg-brand-900/60 dark:text-brand-300"
          >
            {initials(student.full_name)}
          </motion.div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold text-fg">{student.full_name}</h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-subtle">
              <span className="inline-flex items-center gap-1"><UserRound className="size-3.5" />{genderLabel(student.gender)}</span>
              <span className="inline-flex items-center gap-1"><Cake className="size-3.5" />{formatDate(student.date_of_birth)}</span>
              <span>Kelas {view.className}</span>
              {student.student_number ? <span>NIS {student.student_number}</span> : null}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {latest ? <BmiStatusBadge status={latest.bmiStatus} reason={latest.reason} /> : null}
            {latest?.heightStatus ? <HeightStatusBadge status={latest.heightStatus} /> : null}
            {!view.isActive ? <Badge tone="neutral">Nonaktif</Badge> : null}
          </div>
        </div>
      </Card>

      <div className="flex flex-col gap-5">
        <StatGrid>
          <StatCard label="Tinggi terakhir" value={latest?.heightCm != null ? `${formatDecimal(latest.heightCm)} cm` : '-'} hint={latest ? formatDate(latest.date) : 'Belum diukur'} icon={<Ruler className="size-4" />} />
          <StatCard label="Berat terakhir" value={latest?.weightKg != null ? `${formatDecimal(latest.weightKg)} kg` : '-'} hint={latest ? `Usia ${formatAgeMonths(latest.ageMonths)}` : undefined} icon={<Scale className="size-4" />} />
          <StatCard label="z IMT/U" value={formatZ(latest?.bmiZ)} hint={latest ? `IMT ${formatDecimal(latest.bmi)} kg/m²` : undefined} animateValue={false} />
          <StatCard label="z TB/U" value={formatZ(latest?.hfaZ)} hint={latest?.reason ?? `${points.length} pengukuran`} animateValue={false} />
        </StatGrid>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader title="Tinggi badan" description="cm, per tanggal ukur" />
            <CardBody>
              <MeasureLineChart data={points.map(point => ({ date: point.date, value: point.heightCm }))} unit="cm" name="Tinggi" />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Berat badan" description="kg, per tanggal ukur" />
            <CardBody>
              <MeasureLineChart data={points.map(point => ({ date: point.date, value: point.weightKg }))} unit="kg" name="Berat" color={SERIES.secondary} />
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader
            title="Posisi terhadap referensi WHO 2007"
            description="Titik siswa di atas kurva −3, −2, median, +2, +3 SD (sumbu-x: usia)."
            actions={
              <Tabs<RefTab>
                ariaLabel="Indikator referensi"
                value={refTab}
                onChange={setRefTab}
                className="border-b-0"
                items={[
                  { value: 'bmi', label: 'IMT/U' },
                  { value: 'height', label: 'TB/U' },
                ]}
              />
            }
          />
          <CardBody>
            <ReferenceBandChart
              curve={reference.curve}
              points={reference.points}
              unit={refTab === 'bmi' ? 'kg/m²' : 'cm'}
              name={refTab === 'bmi' ? 'IMT siswa' : 'Tinggi siswa'}
            />
            <MethodNote>
              Kurva dari parameter LMS WHO Growth Reference 2007 (5–19 th). Pengukuran sebelum usia 5 th tidak diplot
              (standar WHO 2006 belum dipasang).
            </MethodNote>
          </CardBody>
        </Card>

        <div className="grid gap-5 xl:grid-cols-5">
          <Card className="xl:col-span-3">
            <CardHeader title="Riwayat pengukuran" description={`${points.length} record`} />
            {points.length === 0 ? (
              <EmptyState title="Belum ada pengukuran" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-card-muted/60 text-left text-xs font-medium text-fg-subtle">
                    <tr>
                      <th className="px-4 py-2.5">Tanggal</th>
                      <th className="px-4 py-2.5">Usia</th>
                      <th className="px-4 py-2.5 text-right">TB</th>
                      <th className="px-4 py-2.5 text-right">BB</th>
                      <th className="px-4 py-2.5 text-right">IMT</th>
                      <th className="px-4 py-2.5 text-right">z IMT/U</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5 text-right">z TB/U</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {[...points].reverse().map((point, index) => (
                      <motion.tr key={point.record.id} custom={index} variants={tableRowVariants} initial="hidden" animate="show">
                        <td className="whitespace-nowrap px-4 py-2.5 text-fg">{formatDate(point.date)}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-fg-muted">{formatAgeMonths(point.ageMonths)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{formatDecimal(point.heightCm)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{formatDecimal(point.weightKg)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{formatDecimal(point.bmi)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{formatZ(point.bmiZ)}</td>
                        <td className="px-4 py-2.5"><BmiStatusBadge status={point.bmiStatus} reason={point.reason} /></td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{formatZ(point.hfaZ)}</td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card className="xl:col-span-2">
            <CardHeader title="Riwayat imunisasi" description={`${immunizations.length} record`} />
            {immunizations.length === 0 ? (
              <EmptyState title="Belum ada imunisasi" icon={<Syringe className="size-6" />} />
            ) : (
              <motion.ol className="relative px-5 py-4" variants={staggerContainer(0.05)} initial="hidden" animate="show">
                {immunizations.map((record, index) => (
                  <motion.li key={record.id} variants={staggerItem} className="relative flex gap-3 pb-5 last:pb-0">
                    {index < immunizations.length - 1 ? (
                      <span className="absolute left-[7px] top-4 h-full w-px bg-line" aria-hidden />
                    ) : null}
                    <span
                      className={`relative mt-1 size-[15px] shrink-0 rounded-full border-2 border-card ${record.status === 'given' ? 'bg-success' : 'bg-line-strong'}`}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-fg">
                          {record.vaccine_name}
                          {record.dose_label ? <span className="text-fg-subtle"> · {record.dose_label}</span> : null}
                        </p>
                        <ImmunizationStatusBadge status={record.status} />
                      </div>
                      <p className="text-xs text-fg-subtle">
                        {formatDate(record.administered_at)}
                        {record.officer_name ? ` · ${record.officer_name}` : ''}
                      </p>
                      {record.adverse_event_notes?.trim() ? (
                        <p className="mt-1 inline-flex items-start gap-1 text-xs text-danger">
                          <AlertTriangle className="mt-0.5 size-3 shrink-0" /> KIPI: {record.adverse_event_notes}
                        </p>
                      ) : null}
                    </div>
                  </motion.li>
                ))}
              </motion.ol>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

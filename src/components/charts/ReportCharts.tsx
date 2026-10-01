import { motion } from 'motion/react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatDate, formatDecimal, formatNumber, formatPercent, monthLabel } from '@/lib/format';
import { staggerContainer, staggerItem } from '@/lib/motion';
import { EmptyState } from '@/components/ui/States';
import { CountUp } from '@/components/ui/CountUp';
import { SERIES } from './Charts';
import { AXIS_PROPS, GRID, LEGEND_PROPS, LINE_CURSOR, SEGMENT_STROKE, TOOLTIP_STYLE, useChartAnimation } from './theme';

export type StatusItem = { key: string; label: string; color: string; count: number; hint?: string };

/** Donat distribusi + legenda berlabel (jumlah & persen) — identitas tidak hanya lewat warna. */
export function StatusDonut({
  items,
  centerLabel,
  emptyTitle = 'Belum ada data',
  emptyDescription,
  height = 200,
}: {
  items: StatusItem[];
  centerLabel: string;
  emptyTitle?: string;
  emptyDescription?: string;
  height?: number;
}) {
  const anim = useChartAnimation();
  const total = items.reduce((sum, item) => sum + item.count, 0);
  if (total === 0) return <EmptyState title={emptyTitle} description={emptyDescription} />;
  const data = items.filter(item => item.count > 0);
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <div className="relative w-full max-w-[220px] shrink-0" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip
              {...TOOLTIP_STYLE}
              formatter={(value, name) => [`${value} siswa (${formatPercent(Number(value) / total)})`, name]}
            />
            <Pie
              data={data}
              dataKey="count"
              nameKey="label"
              innerRadius="62%"
              outerRadius="92%"
              paddingAngle={data.length > 1 ? 1.5 : 0}
              {...SEGMENT_STROKE}
              {...anim}
            >
              {data.map(item => (
                <Cell key={item.key} fill={item.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-semibold tabular-nums text-fg">
            <CountUp value={total} />
          </span>
          <span className="text-[11px] text-fg-subtle">{centerLabel}</span>
        </div>
      </div>
      <motion.ul
        className="flex w-full min-w-0 flex-col gap-1.5"
        variants={staggerContainer(0.04)}
        initial="hidden"
        animate="show"
      >
        {items.map(item => (
          <motion.li key={item.key} variants={staggerItem} className="flex items-center gap-2 text-sm">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: item.color }} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-fg-muted" title={item.hint}>
              {item.label}
              {item.hint ? <span className="ml-1 text-[11px] text-fg-subtle">{item.hint}</span> : null}
            </span>
            <span className="tabular-nums font-medium text-fg">{formatNumber(item.count)}</span>
            <span className="w-11 text-right text-xs tabular-nums text-fg-subtle">{formatPercent(item.count / total)}</span>
          </motion.li>
        ))}
      </motion.ul>
    </div>
  );
}

export type StackSeries = { key: string; label: string; color: string };

/** Batang horizontal bertumpuk per kategori (mis. status gizi per kelas). `percent` = dinormalisasi 100%. */
export function StackedStatusBar({
  rows,
  series,
  percent = false,
  labelWidth = 96,
  emptyTitle = 'Belum ada data',
}: {
  rows: Array<{ label: string } & Record<string, number | string>>;
  series: StackSeries[];
  percent?: boolean;
  labelWidth?: number;
  emptyTitle?: string;
}) {
  const anim = useChartAnimation();
  const data = rows.map(row => {
    const total = series.reduce((sum, item) => sum + (Number(row[item.key]) || 0), 0);
    const out: Record<string, number | string> = { label: row.label, __total: total };
    for (const item of series) {
      const value = Number(row[item.key]) || 0;
      out[item.key] = percent ? (total > 0 ? (value / total) * 100 : 0) : value;
      out[`${item.key}__n`] = value;
    }
    return out;
  });
  if (data.length === 0 || data.every(row => row.__total === 0)) return <EmptyState title={emptyTitle} />;
  const height = Math.max(180, data.length * 38 + 70);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 4, bottom: 0 }} barCategoryGap={8}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" domain={percent ? [0, 100] : [0, 'auto']} unit={percent ? '%' : undefined} allowDecimals={false} {...AXIS_PROPS} />
        <YAxis type="category" dataKey="label" width={labelWidth} {...AXIS_PROPS} />
        <Tooltip
          {...TOOLTIP_STYLE}
          formatter={(value, name, item) => {
            const key = String(item.dataKey ?? '');
            const n = Number(item.payload?.[`${key}__n`] ?? value);
            return [percent ? `${n} (${formatDecimal(Number(value), 0)}%)` : formatNumber(n), name];
          }}
        />
        <Legend {...LEGEND_PROPS} />
        {series.map((item, index) => (
          <Bar
            key={item.key}
            dataKey={item.key}
            name={item.label}
            stackId="s"
            fill={item.color}
            maxBarSize={22}
            radius={index === series.length - 1 ? [0, 4, 4, 0] : 0}
            {...SEGMENT_STROKE}
            {...anim}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Persentase cakupan per baris (0–1) dengan label langsung. */
export function CoverageBars({
  rows,
  name,
  labelWidth = 120,
  color = SERIES.primary,
  emptyTitle = 'Belum ada data',
}: {
  rows: Array<{ label: string; value: number | null; detail?: string }>;
  name: string;
  labelWidth?: number;
  color?: string;
  emptyTitle?: string;
}) {
  const anim = useChartAnimation();
  if (rows.length === 0) return <EmptyState title={emptyTitle} />;
  const data = rows.map(row => ({ ...row, pct: Math.round((row.value ?? 0) * 1000) / 10 }));
  const height = Math.max(160, data.length * 36 + 40);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 52, left: 4, bottom: 0 }}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" domain={[0, 100]} unit="%" {...AXIS_PROPS} />
        <YAxis type="category" dataKey="label" width={labelWidth} {...AXIS_PROPS} />
        <Tooltip
          {...TOOLTIP_STYLE}
          formatter={(value, _name, item) => [`${formatDecimal(Number(value))}%${item.payload.detail ? ` · ${item.payload.detail}` : ''}`, name]}
        />
        <Bar dataKey="pct" name={name} fill={color} radius={[0, 4, 4, 0]} maxBarSize={18} {...anim}>
          <LabelList
            dataKey="pct"
            position="right"
            formatter={(value: unknown) => `${formatDecimal(Number(value), 0)}%`}
            style={{ fill: 'var(--fg-muted)', fontSize: 12 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function MonthlyCountChart({ data, name }: { data: Array<{ key: string; value: number }>; name: string }) {
  const anim = useChartAnimation();
  if (data.length === 0) return <EmptyState title="Belum ada pengukuran" description="Tidak ada record pada filter ini." />;
  const rows = data.map(item => ({ ...item, label: monthLabel(item.key) }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" {...AXIS_PROPS} />
        <YAxis allowDecimals={false} {...AXIS_PROPS} />
        <Tooltip {...TOOLTIP_STYLE} />
        <Bar dataKey="value" name={name} fill={SERIES.primary} radius={[4, 4, 0, 0]} maxBarSize={28} {...anim} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Rata-rata z-score per bulan. Satu sumbu (satuan sama: SD). */
export function ZTrendChart({ data }: { data: Array<{ key: string; avgBmiZ: number | null; avgHfaZ: number | null }> }) {
  const anim = useChartAnimation();
  const rows = data
    .filter(item => item.avgBmiZ !== null || item.avgHfaZ !== null)
    .map(item => ({ label: monthLabel(item.key), bmi: item.avgBmiZ, hfa: item.avgHfaZ }));
  if (rows.length === 0) return <EmptyState title="Belum ada z-score" description="Z-score dihitung untuk siswa usia 5–19 th dengan tanggal lahir & jenis kelamin terisi." />;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={rows} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" {...AXIS_PROPS} />
        <YAxis domain={[(min: number) => Math.min(-2.5, Math.floor(min)), (max: number) => Math.max(1.5, Math.ceil(max))]} {...AXIS_PROPS} />
        <ReferenceLine y={0} stroke="var(--line-strong)" />
        <ReferenceLine y={-2} stroke="#C8841F" strokeDasharray="4 4" label={{ value: '−2 SD', position: 'insideBottomLeft', fill: 'var(--fg-subtle)', fontSize: 11 }} />
        <Tooltip {...TOOLTIP_STYLE} cursor={LINE_CURSOR} formatter={(value, name) => [formatDecimal(Number(value), 2), name]} />
        <Legend {...LEGEND_PROPS} />
        <Line type="monotone" dataKey="bmi" name="Rata-rata z IMT/U" stroke={SERIES.primary} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)', fill: SERIES.primary }} connectNulls {...anim} />
        <Line type="monotone" dataKey="hfa" name="Rata-rata z TB/U" stroke={SERIES.secondary} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)', fill: SERIES.secondary }} connectNulls {...anim} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Satu metrik siswa terhadap tanggal ukur. */
export function MeasureLineChart({
  data,
  unit,
  name,
  color = SERIES.primary,
}: {
  data: Array<{ date: string; value: number | null }>;
  unit: string;
  name: string;
  color?: string;
}) {
  const anim = useChartAnimation();
  const rows = data.filter(item => item.value !== null).map(item => ({ label: formatDate(item.date), value: item.value }));
  if (rows.length === 0) return <EmptyState title={`Belum ada data ${name.toLowerCase()}`} />;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={rows} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" {...AXIS_PROPS} minTickGap={16} />
        <YAxis domain={['auto', 'auto']} {...AXIS_PROPS} />
        <Tooltip {...TOOLTIP_STYLE} cursor={LINE_CURSOR} formatter={value => [`${formatDecimal(Number(value))} ${unit}`, name]} />
        <Line type="monotone" dataKey="value" name={name} stroke={color} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)', fill: color }} activeDot={{ r: 5 }} {...anim} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export type ReferenceRow = { months: number; sd: Record<-3 | -2 | 0 | 2 | 3, number> };

const SD_LINES: Array<{ key: -3 | -2 | 0 | 2 | 3; label: string; color: string; dash?: string }> = [
  { key: 3, label: '+3 SD', color: '#8E44AD', dash: '4 4' },
  { key: 2, label: '+2 SD', color: '#4F86E8', dash: '4 4' },
  { key: 0, label: 'Median', color: '#2A9D8F' },
  { key: -2, label: '−2 SD', color: '#C8841F', dash: '4 4' },
  { key: -3, label: '−3 SD', color: '#C0392B', dash: '4 4' },
];

/** Titik siswa di atas kurva referensi WHO 2007 (sumbu-x usia). */
export function ReferenceBandChart({
  curve,
  points,
  unit,
  name,
}: {
  curve: ReferenceRow[];
  points: Array<{ months: number; value: number; date: string }>;
  unit: string;
  name: string;
}) {
  const anim = useChartAnimation();
  if (points.length === 0 || curve.length === 0) {
    return <EmptyState title="Belum ada titik yang bisa diplot" description="Butuh pengukuran pada usia 5–19 th dengan tanggal lahir & jenis kelamin terisi." />;
  }
  const data = curve.map(row => ({
    months: row.months,
    band: [row.sd[-2], row.sd[2]] as [number, number],
    sdm3: row.sd[-3],
    sdm2: row.sd[-2],
    sd0: row.sd[0],
    sd2: row.sd[2],
    sd3: row.sd[3],
  }));
  const keyOf = (key: number) => (key < 0 ? `sdm${-key}` : `sd${key}`);
  const minX = curve[0].months;
  const maxX = curve[curve.length - 1].months;
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          type="number"
          dataKey="months"
          domain={[minX, maxX]}
          tickFormatter={value => `${formatDecimal(Number(value) / 12, 1)} th`}
          {...AXIS_PROPS}
        />
        <YAxis domain={['auto', 'auto']} {...AXIS_PROPS} />
        <Tooltip
          {...TOOLTIP_STYLE}
          cursor={LINE_CURSOR}
          labelFormatter={value => `Usia ${formatDecimal(Number(value) / 12, 1)} th`}
          formatter={(value, label) => (Array.isArray(value) ? [null, null] : [`${formatDecimal(Number(value))} ${unit}`, label])}
        />
        <Legend {...LEGEND_PROPS} />
        <Area dataKey="band" name="Rentang −2…+2 SD" fill="#2A9D8F" fillOpacity={0.1} stroke="none" legendType="none" {...anim} />
        {SD_LINES.map(line => (
          <Line
            key={line.key}
            dataKey={keyOf(line.key)}
            name={line.label}
            stroke={line.color}
            strokeWidth={line.key === 0 ? 2 : 1.5}
            strokeDasharray={line.dash}
            dot={false}
            activeDot={false}
            {...anim}
          />
        ))}
        <Scatter
          data={points}
          dataKey="value"
          name={name}
          fill={SERIES.primary}
          stroke="var(--card)"
          strokeWidth={2}
          line={{ stroke: SERIES.primary, strokeWidth: 1.5 }}
          {...anim}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

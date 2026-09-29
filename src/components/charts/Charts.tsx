import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatDecimal, formatPercent, monthLabel } from '@/lib/format';
import { NUTRITION_COLORS, type NutritionCategory } from '@/lib/nutrition';
import { EmptyState } from '@/components/ui/States';

// Palet 2-seri divalidasi (dataviz validate_palette) untuk light & dark:
// CVD ΔE ≥ 24, lightness band OK. Kontras terang < 3:1 → tooltip + tabel sebagai relief.
export const SERIES = { primary: '#2D9CDB', secondary: '#C27C0E' } as const;

const GRID = 'var(--line)';
const AXIS_PROPS = { tickLine: false, axisLine: false, fontSize: 12 } as const;
const TOOLTIP_STYLE = {
  contentStyle: { background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10, fontSize: 12, color: 'var(--fg)' },
  labelStyle: { color: 'var(--fg)', fontWeight: 600 },
  itemStyle: { color: 'var(--fg-muted)' },
  cursor: { fill: 'var(--card-muted)' },
};
const LEGEND_PROPS = {
  iconType: 'circle' as const,
  iconSize: 8,
  wrapperStyle: { fontSize: 12, color: 'var(--fg-muted)', paddingTop: 8 },
};

export function MonthlyActivityChart({
  data,
}: {
  data: Array<{ key: string; measurements: number; immunizations: number }>;
}) {
  if (data.length === 0) return <EmptyState title="Belum ada aktivitas" description="Belum ada pengukuran/imunisasi pada periode ini." />;
  const rows = data.map(item => ({ ...item, label: monthLabel(item.key) }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barGap={2}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" {...AXIS_PROPS} />
        <YAxis allowDecimals={false} {...AXIS_PROPS} />
        <Tooltip {...TOOLTIP_STYLE} />
        <Legend {...LEGEND_PROPS} />
        <Bar dataKey="measurements" name="Pengukuran" fill={SERIES.primary} radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Bar dataKey="immunizations" name="Imunisasi diberikan" fill={SERIES.secondary} radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Satu metrik per chart (tidak memakai dual-axis). */
export function AverageTrendChart({
  data,
  metric,
}: {
  data: Array<{ key: string; avgHeight: number | null; avgWeight: number | null }>;
  metric: 'avgHeight' | 'avgWeight';
}) {
  const rows = data
    .filter(item => item[metric] !== null)
    .map(item => ({ label: monthLabel(item.key), value: item[metric] }));
  if (rows.length === 0) return <EmptyState title="Belum ada data pengukuran" />;
  const unit = metric === 'avgHeight' ? 'cm' : 'kg';
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={rows} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" {...AXIS_PROPS} />
        <YAxis domain={['auto', 'auto']} {...AXIS_PROPS} />
        <Tooltip
          {...TOOLTIP_STYLE}
          cursor={{ stroke: 'var(--line-strong)' }}
          formatter={value => [`${formatDecimal(Number(value))} ${unit}`, metric === 'avgHeight' ? 'Rata-rata tinggi' : 'Rata-rata berat']}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke={SERIES.primary}
          strokeWidth={2}
          dot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)', fill: SERIES.primary }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function NutritionChart({ data }: { data: Array<{ category: NutritionCategory; count: number }> }) {
  const total = data.reduce((sum, item) => sum + item.count, 0);
  if (total === 0) return <EmptyState title="Belum ada data status gizi" description="Status gizi dihitung dari pengukuran terakhir tiap siswa." />;
  const rows = data.map(item => ({ ...item, pct: item.count / total }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 56, left: 8, bottom: 0 }} barCategoryGap={8}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="category" width={60} {...AXIS_PROPS} />
        <Tooltip {...TOOLTIP_STYLE} formatter={(value, _name, item) => [`${value} siswa (${formatPercent(item.payload.pct)})`, 'Jumlah']} />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={26}>
          {rows.map(item => (
            <Cell key={item.category} fill={NUTRITION_COLORS[item.category]} />
          ))}
          <LabelList
            dataKey="count"
            position="right"
            formatter={(value: unknown) => `${value} · ${formatPercent(Number(value) / total)}`}
            style={{ fill: 'var(--fg-muted)', fontSize: 12 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ClassCoverageChart({
  data,
}: {
  data: Array<{ className: string; measuredPct: number | null; immunizedPct: number | null }>;
}) {
  const rows = data.map(item => ({
    className: item.className,
    measured: Math.round((item.measuredPct ?? 0) * 100),
    immunized: Math.round((item.immunizedPct ?? 0) * 100),
  }));
  if (rows.length === 0) return <EmptyState title="Belum ada kelas" />;
  const height = Math.max(200, rows.length * 44 + 60);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }} barGap={2}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" domain={[0, 100]} unit="%" {...AXIS_PROPS} />
        <YAxis type="category" dataKey="className" width={90} {...AXIS_PROPS} />
        <Tooltip {...TOOLTIP_STYLE} formatter={value => `${value}%`} />
        <Legend {...LEGEND_PROPS} />
        <Bar dataKey="measured" name="Cakupan pengukuran" fill={SERIES.primary} radius={[0, 4, 4, 0]} maxBarSize={14} />
        <Bar dataKey="immunized" name="Cakupan imunisasi" fill={SERIES.secondary} radius={[0, 4, 4, 0]} maxBarSize={14} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SimpleBarChart({
  data,
  name,
}: {
  data: Array<{ label: string; value: number }>;
  name: string;
}) {
  if (data.length === 0) return <EmptyState title="Belum ada data" />;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" {...AXIS_PROPS} interval={0} tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} {...AXIS_PROPS} />
        <Tooltip {...TOOLTIP_STYLE} />
        <Bar dataKey="value" name={name} fill={SERIES.primary} radius={[4, 4, 0, 0]} maxBarSize={32} />
      </BarChart>
    </ResponsiveContainer>
  );
}

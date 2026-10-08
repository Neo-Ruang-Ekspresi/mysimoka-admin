import { useMemo } from 'react';
import {
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import type { BlandAltman, Pair } from '@/lib/agreementStats';
import { SERIES } from './Charts';

const AXIS_PROPS = { tickLine: false, axisLine: false, fontSize: 12 } as const;

function fmt(value: number, digits: number) {
  return value.toLocaleString('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

type Point = { x: number; y: number; count: number };

/**
 * Plot Bland–Altman terhadap acuan: x = nilai acuan (pasti), y = bacaan − acuan.
 * Titik identik digabung (ukuran = jumlah bacaan). Garis bias & LoA, pita toleransi opsional.
 */
export function BlandAltmanChart({
  pairs,
  stats,
  tolerance,
  unit,
  digits,
  height = 300,
}: {
  pairs: Pair[];
  stats: BlandAltman;
  tolerance: number | null;
  unit: string;
  digits: number;
  height?: number;
}) {
  const { points, yDomain, xDomain } = useMemo(() => {
    const map = new Map<string, Point>();
    for (const pair of pairs) {
      const y = pair.reading - pair.reference;
      const key = `${pair.reference}|${y.toFixed(6)}`;
      const current = map.get(key);
      if (current) current.count += 1;
      else map.set(key, { x: pair.reference, y: Number(y.toFixed(6)), count: 1 });
    }
    const list = [...map.values()];
    const ys = [...list.map(p => p.y), stats.loaLower, stats.loaUpper, 0];
    if (tolerance) ys.push(-tolerance, tolerance);
    const lo = Math.min(...ys);
    const hi = Math.max(...ys);
    const pad = Math.max((hi - lo) * 0.12, 10 ** -digits);
    const xs = list.map(p => p.x);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const xPad = Math.max((xMax - xMin) * 0.08, 1);
    return {
      points: list,
      yDomain: [lo - pad, hi + pad] as [number, number],
      xDomain: [Math.max(0, xMin - xPad), xMax + xPad] as [number, number],
    };
  }, [pairs, stats.loaLower, stats.loaUpper, tolerance, digits]);

  const maxCount = Math.max(1, ...points.map(p => p.count));
  const lineLabel = (text: string) => ({
    value: text,
    position: 'insideTopRight' as const,
    fontSize: 11,
    fill: 'var(--fg-muted)',
  });

  return (
    <div role="img" aria-label={`Plot Bland–Altman: bias ${fmt(stats.bias, digits)} ${unit}, batas kesesuaian ${fmt(stats.loaLower, digits)} sampai ${fmt(stats.loaUpper, digits)} ${unit}`}>
      <ResponsiveContainer width="100%" height={height}>
        <ScatterChart margin={{ top: 12, right: 16, left: 4, bottom: 20 }}>
          <CartesianGrid stroke="var(--line)" />
          {tolerance ? (
            <ReferenceArea y1={-tolerance} y2={tolerance} fill="#27ae60" fillOpacity={0.08} stroke="none" ifOverflow="extendDomain" />
          ) : null}
          <XAxis
            type="number"
            dataKey="x"
            name="Nilai acuan"
            domain={xDomain}
            tickFormatter={value => fmt(Number(value), 0)}
            label={{ value: `Nilai acuan (${unit})`, position: 'insideBottom', offset: -12, fontSize: 12, fill: 'var(--fg-muted)' }}
            {...AXIS_PROPS}
          />
          <YAxis
            type="number"
            dataKey="y"
            name="Selisih"
            domain={yDomain}
            width={64}
            tickFormatter={value => fmt(Number(value), digits)}
            label={{ value: `Bacaan − acuan (${unit})`, angle: -90, position: 'insideLeft', offset: 8, fontSize: 12, fill: 'var(--fg-muted)', style: { textAnchor: 'middle' } }}
            {...AXIS_PROPS}
          />
          <ZAxis type="number" dataKey="count" range={[48, 48 + Math.min(maxCount, 10) * 24]} domain={[1, maxCount]} />
          <ReferenceLine y={0} stroke="var(--line-strong)" />
          <ReferenceLine y={stats.bias} stroke="var(--fg-muted)" strokeWidth={2} label={lineLabel(`Bias ${fmt(stats.bias, digits)}`)} />
          <ReferenceLine
            y={stats.loaUpper}
            stroke={SERIES.secondary}
            strokeWidth={2}
            strokeDasharray="6 4"
            label={lineLabel(`LoA atas ${fmt(stats.loaUpper, digits)}`)}
          />
          <ReferenceLine
            y={stats.loaLower}
            stroke={SERIES.secondary}
            strokeWidth={2}
            strokeDasharray="6 4"
            label={{ ...lineLabel(`LoA bawah ${fmt(stats.loaLower, digits)}`), position: 'insideBottomRight' }}
          />
          <Tooltip
            cursor={{ strokeDasharray: '3 3', stroke: 'var(--line-strong)' }}
            content={({ active, payload }) => {
              const point = active ? (payload?.[0]?.payload as Point | undefined) : undefined;
              if (!point) return null;
              return (
                <div className="rounded-[10px] border border-line bg-card px-3 py-2 text-xs text-fg shadow-sm">
                  <p className="font-semibold">
                    Acuan {fmt(point.x, digits)} {unit}
                  </p>
                  <p className="text-fg-muted">
                    Bacaan {fmt(point.x + point.y, digits)} {unit} · selisih {point.y > 0 ? '+' : ''}
                    {fmt(point.y, digits)} {unit}
                  </p>
                  {point.count > 1 ? <p className="text-fg-muted">{point.count} bacaan sama</p> : null}
                </div>
              );
            }}
          />
          <Scatter data={points} fill={SERIES.primary} stroke="var(--card)" strokeWidth={2} fillOpacity={0.9} isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 px-1 text-[11px] text-fg-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: SERIES.primary }} /> Bacaan (besar titik = jumlah bacaan sama)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4" style={{ background: 'var(--fg-muted)' }} /> Bias
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: SERIES.secondary }} /> Batas kesesuaian 95%
        </span>
        {tolerance ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-sm bg-[#27ae60]/20" /> Toleransi ±{fmt(tolerance, digits)} {unit}
          </span>
        ) : null}
      </div>
    </div>
  );
}

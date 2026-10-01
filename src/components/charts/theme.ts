import { useReducedMotion } from 'motion/react';

/** Token visual grafik — warna lewat CSS variable agar ikut light/dark. */
export const GRID = 'var(--line)';
export const AXIS_PROPS = { tickLine: false, axisLine: false, fontSize: 12 } as const;
export const TOOLTIP_STYLE = {
  contentStyle: { background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10, fontSize: 12, color: 'var(--fg)' },
  labelStyle: { color: 'var(--fg)', fontWeight: 600 },
  itemStyle: { color: 'var(--fg-muted)' },
  cursor: { fill: 'var(--card-muted)' },
};
export const LINE_CURSOR = { stroke: 'var(--line-strong)' };
export const LEGEND_PROPS = {
  iconType: 'circle' as const,
  iconSize: 8,
  wrapperStyle: { fontSize: 12, color: 'var(--fg-muted)', paddingTop: 8 },
};
/** Celah 2px antar segmen/batang (warna permukaan kartu). */
export const SEGMENT_STROKE = { stroke: 'var(--card)', strokeWidth: 2 };

/** Durasi animasi recharts (ms) — selaras token motion (≤ 600 ms untuk grafik). */
export const CHART_ANIMATION_MS = 500;

/** Props animasi recharts yang menghormati prefers-reduced-motion. */
export function useChartAnimation() {
  const reduced = useReducedMotion();
  return { isAnimationActive: !reduced, animationDuration: CHART_ANIMATION_MS, animationEasing: 'ease-out' as const };
}

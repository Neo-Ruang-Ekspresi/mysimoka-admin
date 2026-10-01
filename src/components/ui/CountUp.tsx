import { useEffect, useRef } from 'react';
import { animate, useReducedMotion } from 'motion/react';

/**
 * Angka yang "menghitung naik" dari 0 (atau nilai sebelumnya) ke `value`.
 * Pakai langsung (`<CountUp value={n} format={formatNumber} />`) atau biarkan StatCard
 * mendeteksi string angka berformat id-ID secara otomatis.
 */
export function CountUp({
  value,
  format = n => Math.round(n).toLocaleString('id-ID'),
  duration = 0.7,
  className,
}: {
  value: number;
  format?: (value: number) => string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const previous = useRef(0);
  const reduce = useReducedMotion();
  const formatRef = useRef(format);
  useEffect(() => {
    formatRef.current = format;
  }, [format]);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const from = previous.current;
    previous.current = value;
    if (reduce || from === value) {
      node.textContent = formatRef.current(value);
      return;
    }
    const controls = animate(from, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: latest => {
        node.textContent = formatRef.current(latest);
      },
    });
    return () => controls.stop();
  }, [value, duration, reduce]);

  return (
    <span ref={ref} className={className}>
      {format(value)}
    </span>
  );
}

/**
 * Parse string angka berformat id-ID (mis. "1.234", "45,6%", "12 kg") menjadi
 * { prefix, number, suffix, decimals }. Mengembalikan null bila bukan angka tunggal.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function parseFormattedNumber(text: string) {
  const match = /^(\D*?)(-?\d{1,3}(?:\.\d{3})*(?:,\d+)?|-?\d+(?:,\d+)?)(\D*)$/.exec(text.trim());
  if (!match) return null;
  const [, prefix, raw, suffix] = match;
  const decimals = raw.includes(',') ? raw.split(',')[1].length : 0;
  const number = Number(raw.replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(number)) return null;
  return { prefix, number, suffix, decimals };
}

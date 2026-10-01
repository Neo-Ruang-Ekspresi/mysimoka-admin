import { useMemo, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/object';
import { springSnappy, staggerItem } from '@/lib/motion';
import { CountUp, parseFormattedNumber } from './CountUp';

function AnimatedValue({ value }: { value: ReactNode }) {
  const parsed = useMemo(
    () => (typeof value === 'number' ? { prefix: '', number: value, suffix: '', decimals: 0 } : typeof value === 'string' ? parseFormattedNumber(value) : null),
    [value],
  );
  if (!parsed) return <>{value}</>;
  const { prefix, suffix, decimals } = parsed;
  return (
    <CountUp
      value={parsed.number}
      format={n => `${prefix}${n.toLocaleString('id-ID', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`}
    />
  );
}

/**
 * Kartu statistik: angka count-up otomatis (number atau string id-ID), hover lift,
 * meter progress animasi. Bila dibungkus container `staggerContainer()` (lib/motion),
 * kartu muncul berurutan.
 */
export function StatCard({
  label,
  value,
  hint,
  icon,
  progress,
  className,
  animateValue = true,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  /** 0..1 — menampilkan meter tipis di bawah nilai. */
  progress?: number | null;
  className?: string;
  /** false → tampilkan value apa adanya tanpa count-up. */
  animateValue?: boolean;
}) {
  const ratio = progress === undefined || progress === null ? null : Math.max(0, Math.min(1, progress));
  return (
    <motion.div
      variants={staggerItem}
      whileHover={{ y: -2, transition: springSnappy }}
      className={cn(
        'rounded-xl border border-line bg-card p-4 transition-[box-shadow,border-color] duration-200 hover:border-line-strong hover:shadow-md',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-fg-subtle">{label}</p>
        {icon ? <span className="rounded-lg bg-brand-50 p-1.5 text-brand-500 dark:bg-brand-900/40">{icon}</span> : null}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-fg">{animateValue ? <AnimatedValue value={value} /> : value}</p>
      {ratio !== null ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-card-muted" aria-hidden>
          <motion.div
            className="h-full rounded-full bg-brand-500"
            initial={{ width: 0 }}
            animate={{ width: `${ratio * 100}%` }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
      ) : null}
      {hint ? <p className="mt-1.5 text-xs text-fg-subtle">{hint}</p> : null}
    </motion.div>
  );
}

/** Grid StatCard dengan entrance stagger. Ganti `<div className="grid …">` dengan ini. */
export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={cn('grid grid-cols-2 gap-3 md:grid-cols-4', className)}
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}
    >
      {children}
    </motion.div>
  );
}

import type { ReactNode } from 'react';
import { cn } from '@/lib/object';

export function StatCard({
  label,
  value,
  hint,
  icon,
  progress,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  /** 0..1 — menampilkan meter tipis di bawah nilai. */
  progress?: number | null;
  className?: string;
}) {
  return (
    <div className={cn('rounded-xl border border-line bg-card p-4', className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-fg-subtle">{label}</p>
        {icon ? <span className="rounded-lg bg-brand-50 p-1.5 text-brand-500 dark:bg-brand-900/40">{icon}</span> : null}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-fg">{value}</p>
      {progress !== undefined && progress !== null ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-card-muted" aria-hidden>
          <div
            className="h-full rounded-full bg-brand-500 transition-[width]"
            style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }}
          />
        </div>
      ) : null}
      {hint ? <p className="mt-1.5 text-xs text-fg-subtle">{hint}</p> : null}
    </div>
  );
}

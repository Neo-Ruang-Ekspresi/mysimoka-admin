import { useId, type ReactNode } from 'react';
import { NavLink } from 'react-router';
import { LayoutGroup, motion } from 'motion/react';
import { cn } from '@/lib/object';
import { springSnappy } from '@/lib/motion';

export type TabItem<V extends string = string> = { value: V; label: ReactNode; icon?: ReactNode; count?: number; disabled?: boolean };

const TAB_BASE =
  'relative -mb-px inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';

function Indicator() {
  return (
    <motion.span
      layoutId="tab-indicator"
      className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand-500"
      transition={springSnappy}
      aria-hidden
    />
  );
}

/** Tab berbasis state dengan garis indikator yang bergeser (layoutId). */
export function Tabs<V extends string>({
  items,
  value,
  onChange,
  className,
  ariaLabel,
}: {
  items: TabItem<V>[];
  value: V;
  onChange: (value: V) => void;
  className?: string;
  ariaLabel?: string;
}) {
  const id = useId();
  return (
    <LayoutGroup id={id}>
      <div role="tablist" aria-label={ariaLabel} className={cn('flex gap-1 overflow-x-auto border-b border-line', className)}>
        {items.map(item => {
          const active = item.value === value;
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={active}
              disabled={item.disabled}
              onClick={() => onChange(item.value)}
              className={cn(TAB_BASE, active ? 'text-brand-600 dark:text-brand-300' : 'text-fg-subtle hover:text-fg')}
            >
              {item.icon}
              {item.label}
              {item.count !== undefined ? (
                <span className="rounded-full bg-card-muted px-1.5 text-[11px] tabular-nums text-fg-muted">{item.count}</span>
              ) : null}
              {active ? <Indicator /> : null}
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}

/** Tab berbasis route (NavLink) dengan indikator animasi. */
export function NavTabs({
  items,
  className,
  ariaLabel,
}: {
  items: Array<{ to: string; label: ReactNode; end?: boolean }>;
  className?: string;
  ariaLabel?: string;
}) {
  const id = useId();
  return (
    <LayoutGroup id={id}>
      <nav aria-label={ariaLabel} className={cn('flex gap-1 overflow-x-auto border-b border-line', className)}>
        {items.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => cn(TAB_BASE, isActive ? 'text-brand-600 dark:text-brand-300' : 'text-fg-subtle hover:text-fg')}
          >
            {({ isActive }) => (
              <>
                {item.label}
                {isActive ? <Indicator /> : null}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </LayoutGroup>
  );
}

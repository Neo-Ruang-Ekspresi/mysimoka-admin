import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/Button';
import { DURATION, EASE_OUT } from '@/lib/motion';
import { cn } from '@/lib/object';

export type MenuItem = {
  key: string;
  label: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
};
export type MenuSection = { title?: string; items: MenuItem[] };

const menuMotion = {
  initial: { opacity: 0, y: -4, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: DURATION.fast, ease: EASE_OUT } },
  exit: { opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.1 } },
};

/** Tombol + dropdown menu (gaya sama dengan dropdown topbar). */
export function MenuButton({
  label,
  sections,
  icon,
  variant = 'secondary',
  size = 'sm',
  loading,
  align = 'right',
}: {
  label: ReactNode;
  sections: MenuSection[];
  icon?: ReactNode;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  loading?: boolean;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex">
      <Button
        variant={variant}
        size={size}
        icon={icon}
        loading={loading}
        onClick={() => setOpen(value => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {label}
        <ChevronDown className={cn('size-3.5 transition-transform duration-200', open && 'rotate-180')} aria-hidden />
      </Button>
      <AnimatePresence>
        {open ? (
          <motion.div
            {...menuMotion}
            role="menu"
            className={cn(
              'absolute top-full z-40 mt-1 w-64 rounded-xl border border-line bg-card p-1 shadow-lg',
              align === 'right' ? 'right-0 origin-top-right' : 'left-0 origin-top-left',
            )}
          >
            {sections.map((section, index) => (
              <div key={section.title ?? index} className={cn(index > 0 && 'mt-1 border-t border-line pt-1')}>
                {section.title ? (
                  <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">{section.title}</p>
                ) : null}
                {section.items.map(item => (
                  <button
                    key={item.key}
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    onClick={() => {
                      setOpen(false);
                      item.onSelect();
                    }}
                    className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-fg transition-colors hover:bg-card-muted disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {item.icon ? <span className="mt-0.5 text-fg-subtle">{item.icon}</span> : null}
                    <span className="min-w-0">
                      <span className="block font-medium">{item.label}</span>
                      {item.hint ? <span className="block text-xs text-fg-subtle">{item.hint}</span> : null}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

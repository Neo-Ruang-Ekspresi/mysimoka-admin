import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/object';
import { DURATION, EASE_OUT } from '@/lib/motion';

export type RowAction = {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  /** Tooltip (mis. alasan disabled). */
  title?: string;
  /** Item disembunyikan (mis. kapabilitas tidak ada). */
  hidden?: boolean;
};

/**
 * Menu aksi per baris (⋯). Dirender lewat portal agar tidak terpotong `overflow-x-auto` tabel.
 * Klik tombol tidak memicu `onRowClick` tabel.
 */
export function RowActions({ actions, label = 'Aksi' }: { actions: RowAction[]; label?: string }) {
  const visible = actions.filter(item => !item.hidden);
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean } | null>(null);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const menuHeight = Math.min(visible.length * 36 + 8, 320);
    const up = rect.bottom + menuHeight + 8 > window.innerHeight && rect.top > menuHeight;
    setPos({ top: up ? rect.top - 4 : rect.bottom + 4, left: Math.max(8, rect.right - 192), up });
  }, [open, visible.length]);

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      const target = event.target as Node | null;
      if (target && (menuRef.current?.contains(target) || buttonRef.current?.contains(target))) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onScroll = () => setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    menuRef.current?.querySelector<HTMLElement>('button:not([disabled])')?.focus();
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, pos]);

  if (visible.length === 0) return null;

  const onMenuKey = (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? []);
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next = event.key === 'ArrowDown' ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={event => {
          event.stopPropagation();
          setOpen(value => !value);
        }}
        className="inline-flex size-8 items-center justify-center rounded-lg text-fg-subtle transition-colors hover:bg-card-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
      >
        <MoreHorizontal className="size-4" />
      </button>
      {createPortal(
        <AnimatePresence>
          {open && pos ? (
            <motion.div
              ref={menuRef}
              role="menu"
              onKeyDown={onMenuKey}
              onClick={event => event.stopPropagation()}
              initial={{ opacity: 0, scale: 0.96, y: pos.up ? 4 : -4 }}
              animate={{ opacity: 1, scale: 1, y: 0, transition: { duration: DURATION.fast, ease: EASE_OUT } }}
              exit={{ opacity: 0, scale: 0.97, transition: { duration: DURATION.fast } }}
              style={{
                position: 'fixed',
                top: pos.top,
                left: pos.left,
                transformOrigin: pos.up ? 'bottom right' : 'top right',
                translate: pos.up ? '0 -100%' : undefined,
              }}
              className="z-[60] w-48 overflow-hidden rounded-xl border border-line bg-card py-1 shadow-xl"
            >
              {visible.map(action => (
                <button
                  key={action.label}
                  type="button"
                  role="menuitem"
                  disabled={action.disabled}
                  title={action.title}
                  onClick={() => {
                    setOpen(false);
                    action.onSelect();
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
                    action.tone === 'danger'
                      ? 'text-danger hover:bg-[#FDEEEE] focus:bg-[#FDEEEE] dark:hover:bg-danger/15 dark:focus:bg-danger/15'
                      : 'text-fg hover:bg-card-muted focus:bg-card-muted',
                  )}
                >
                  {action.icon ? <span className="flex size-4 items-center justify-center">{action.icon}</span> : null}
                  {action.label}
                </button>
              ))}
            </motion.div>
          ) : null}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}

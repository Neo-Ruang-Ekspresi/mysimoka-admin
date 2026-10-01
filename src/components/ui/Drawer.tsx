import { useRef, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '@/lib/object';
import { backdrop, drawerPanel } from '@/lib/motion';
import { useOverlayBehavior } from './overlay';

export type DrawerProps = {
  open: boolean;
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Tombol aksi di bawah (mis. Batal + Simpan). Tetap terlihat saat body di-scroll. */
  footer?: ReactNode;
  side?: 'left' | 'right';
  size?: 'md' | 'lg' | 'xl';
  /**
   * Bila diisi, body + footer dibungkus <form>; tombol `type="submit"` di footer akan memicu ini
   * (Enter di input juga). preventDefault sudah ditangani.
   */
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
};

const SIZES = { md: 'sm:max-w-md', lg: 'sm:max-w-xl', xl: 'sm:max-w-3xl' } as const;

/** Side sheet untuk form tambah/ubah data. */
export function Drawer({ open, title, description, onClose, children, footer, side = 'right', size = 'md', onSubmit }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useOverlayBehavior(open, onClose, panelRef);

  const content = (
    <>
      <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      {footer ? <div className="flex justify-end gap-2 border-t border-line bg-card px-5 py-3">{footer}</div> : null}
    </>
  );

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div key="drawer" className={cn('fixed inset-0 z-50 flex', side === 'right' ? 'justify-end' : 'justify-start')}>
          <motion.div
            variants={backdrop}
            initial="hidden"
            animate="show"
            exit="exit"
            className="absolute inset-0 bg-[#162534]/45"
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            variants={drawerPanel(side)}
            initial="hidden"
            animate="show"
            exit="exit"
            className={cn(
              'relative flex h-full w-full flex-col bg-card shadow-2xl',
              side === 'right' ? 'border-l' : 'border-r',
              'border-line',
              SIZES[size],
            )}
          >
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-fg">{title}</h2>
                {description ? <div className="mt-0.5 text-xs text-fg-subtle">{description}</div> : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-1 text-fg-subtle transition-colors hover:bg-card-muted hover:text-fg"
                aria-label="Tutup"
              >
                <X className="size-5" />
              </button>
            </div>
            {onSubmit ? (
              <form
                className="flex min-h-0 flex-1 flex-col"
                noValidate
                onSubmit={event => {
                  event.preventDefault();
                  onSubmit(event);
                }}
              >
                {content}
              </form>
            ) : (
              content
            )}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

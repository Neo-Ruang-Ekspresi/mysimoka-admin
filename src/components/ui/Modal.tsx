import { useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '@/lib/object';
import { backdrop, modalPanel } from '@/lib/motion';
import { useOverlayBehavior } from './overlay';

export type ModalProps = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
};

const SIZES = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' } as const;

/** Dialog tengah (bottom-sheet di mobile) dengan animasi scale+fade. API sama seperti versi lama. */
export function Modal({ open, title, description, onClose, children, footer, size = 'md' }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useOverlayBehavior(open, onClose, panelRef);

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div key="modal" className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
          <motion.div
            variants={backdrop}
            initial="hidden"
            animate="show"
            exit="exit"
            className="absolute inset-0 bg-[#162534]/50 backdrop-blur-[1px]"
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            variants={modalPanel}
            initial="hidden"
            animate="show"
            exit="exit"
            className={cn(
              'relative flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-line bg-card shadow-xl sm:rounded-2xl',
              SIZES[size],
            )}
          >
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-fg">{title}</h2>
                {description ? <p className="mt-0.5 text-xs text-fg-subtle">{description}</p> : null}
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
            <div className="overflow-y-auto px-5 py-4">{children}</div>
            {footer ? <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div> : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

// Kompatibilitas: ConfirmDialog dulu diekspor dari file ini.
export { ConfirmDialog } from './ConfirmDialog';

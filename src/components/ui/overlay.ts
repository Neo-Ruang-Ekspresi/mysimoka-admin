import { useEffect, useRef, type RefObject } from 'react';

/**
 * Perilaku bersama overlay (Modal, Drawer, ConfirmDialog):
 *  - Escape hanya menutup overlay paling atas (stack),
 *  - kunci scroll body selama ada overlay terbuka,
 *  - fokus awal ke input pertama (atau tombol) di panel, dan kembalikan fokus saat tutup.
 */
const stack: symbol[] = [];
let lockCount = 0;
let previousOverflow = '';

export function useOverlayBehavior(open: boolean, onClose: () => void, panelRef: RefObject<HTMLElement | null>) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const id = Symbol('overlay');
    stack.push(id);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && stack[stack.length - 1] === id) {
        event.stopPropagation();
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', onKey);
    if (lockCount === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    lockCount += 1;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const target =
      panel?.querySelector<HTMLElement>('[data-autofocus]') ??
      panel?.querySelector<HTMLElement>('input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled])') ??
      panel?.querySelector<HTMLElement>('button:not([disabled])');
    target?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('keydown', onKey);
      const index = stack.indexOf(id);
      if (index >= 0) stack.splice(index, 1);
      lockCount -= 1;
      if (lockCount === 0) document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [open, panelRef]);
}

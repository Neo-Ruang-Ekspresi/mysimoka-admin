import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { EASE_OUT } from '@/lib/motion';

export type ToastTone = 'success' | 'error' | 'info' | 'warning';
export type ToastOptions = { description?: string; /** ms; default 4000 (error 6000) */ duration?: number };
type ToastItem = { id: number; tone: ToastTone; message: string; description?: string; duration: number };

export type ToastApi = {
  success: (message: string, options?: ToastOptions) => void;
  error: (message: string, options?: ToastOptions) => void;
  info: (message: string, options?: ToastOptions) => void;
  warning: (message: string, options?: ToastOptions) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

// Emitter modul agar `toast.success()` bisa dipanggil di luar komponen (mis. callback mutation).
type Listener = (tone: ToastTone, message: string, options?: ToastOptions) => void;
let listener: Listener | null = null;
const queue: Array<Parameters<Listener>> = [];

function emit(...args: Parameters<Listener>) {
  if (listener) listener(...args);
  else queue.push(args);
}

/** API global: `toast.success('Tersimpan')`. Sama dengan hasil `useToast()`. */
export const toast: ToastApi = {
  success: (message, options) => emit('success', message, options),
  error: (message, options) => emit('error', message, options),
  info: (message, options) => emit('info', message, options),
  warning: (message, options) => emit('warning', message, options),
};

const ICONS: Record<ToastTone, ReactNode> = {
  success: <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />,
  error: <XCircle className="mt-0.5 size-4 shrink-0 text-danger" />,
  info: <Info className="mt-0.5 size-4 shrink-0 text-brand-500" />,
  warning: <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />,
};

const ACCENT: Record<ToastTone, string> = {
  success: 'bg-success',
  error: 'bg-danger',
  info: 'bg-brand-500',
  warning: 'bg-warning',
};

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => onDismiss(item.id), item.duration);
    return () => clearTimeout(timer);
  }, [paused, item.id, item.duration, onDismiss]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.22, ease: EASE_OUT } }}
      exit={{ opacity: 0, x: 40, transition: { duration: 0.16, ease: 'easeIn' } }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      role={item.tone === 'error' ? 'alert' : 'status'}
      className="pointer-events-auto relative flex items-start gap-2 overflow-hidden rounded-xl border border-line bg-card py-3 pl-4 pr-9 text-sm text-fg shadow-lg"
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${ACCENT[item.tone]}`} aria-hidden />
      {ICONS[item.tone]}
      <div className="min-w-0">
        <p className="break-words">{item.message}</p>
        {item.description ? <p className="mt-0.5 break-words text-xs text-fg-subtle">{item.description}</p> : null}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        className="absolute right-2 top-2 rounded-md p-1 text-fg-subtle transition-colors hover:bg-card-muted hover:text-fg"
        aria-label="Tutup notifikasi"
      >
        <X className="size-3.5" />
      </button>
    </motion.div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback<Listener>((tone, message, options) => {
    const id = Date.now() + Math.random();
    const duration = options?.duration ?? (tone === 'error' ? 6000 : 4000);
    setItems(current => [...current.slice(-4), { id, tone, message, description: options?.description, duration }]);
  }, []);

  const dismiss = useCallback((id: number) => setItems(current => current.filter(item => item.id !== id)), []);

  useEffect(() => {
    listener = push;
    while (queue.length > 0) push(...queue.shift()!);
    return () => {
      if (listener === push) listener = null;
    };
  }, [push]);

  const api = useMemo<ToastApi>(
    () => ({
      success: (message, options) => push('success', message, options),
      error: (message, options) => push('error', message, options),
      info: (message, options) => push('info', message, options),
      warning: (message, options) => push('warning', message, options),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2"
        aria-live="polite"
      >
        <AnimatePresence initial={false}>
          {items.map(item => (
            <ToastCard key={item.id} item={item} onDismiss={dismiss} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast harus dipakai di dalam ToastProvider');
  return context;
}

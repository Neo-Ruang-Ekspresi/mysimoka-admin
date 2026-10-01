import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import { errorMessage } from '@/api/errors';
import { cn } from '@/lib/object';
import { Button } from './Button';
import { Modal } from './Modal';

export type ConfirmTone = 'danger' | 'primary';

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'danger' untuk hapus/nonaktifkan. `danger` (boolean) dipertahankan untuk kompatibilitas. */
  tone?: ConfirmTone;
  danger?: boolean;
  /**
   * Mode lama (dikontrol pemanggil): bila `loading` diisi, dialog TIDAK menutup/menangani error
   * sendiri. Bila tidak diisi dan `onConfirm` mengembalikan Promise, loading/error/tutup otomatis.
   */
  loading?: boolean;
  /**
   * Boleh async. Promise resolve → dialog ditutup (onClose). Promise reject → pesan error
   * tampil di dialog dan dialog tetap terbuka.
   */
  onConfirm: () => void | Promise<unknown>;
  onClose: () => void;
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Ya, lanjutkan',
  cancelLabel = 'Batal',
  tone,
  danger = false,
  loading,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isDanger = (tone ?? (danger ? 'danger' : 'primary')) === 'danger';
  const controlled = loading !== undefined;
  const busy = Boolean(loading) || pending;

  const close = () => {
    if (busy) return;
    setError(null);
    onClose();
  };

  const confirm = async () => {
    setError(null);
    const result = onConfirm();
    if (controlled || !(result instanceof Promise)) return;
    setPending(true);
    try {
      await result;
      setPending(false);
      onClose();
    } catch (confirmError) {
      setPending(false);
      setError(errorMessage(confirmError));
    }
  };

  return (
    <Modal
      open={open}
      title={title}
      size="sm"
      onClose={close}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy} data-autofocus={isDanger ? true : undefined}>
            {cancelLabel}
          </Button>
          <Button variant={isDanger ? 'danger' : 'primary'} onClick={() => void confirm()} loading={busy} data-autofocus={isDanger ? undefined : true}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-full',
            isDanger ? 'bg-[#FDEEEE] text-danger dark:bg-danger/15' : 'bg-brand-50 text-brand-500 dark:bg-brand-900/40',
          )}
        >
          {isDanger ? <AlertTriangle className="size-4.5" /> : <HelpCircle className="size-4.5" />}
        </span>
        <div className="min-w-0 flex-1 pt-1.5 text-sm text-fg-muted">
          {message}
          {error ? <p className="mt-3 rounded-lg bg-[#FDEEEE] px-3 py-2 text-xs text-danger dark:bg-danger/15">{error}</p> : null}
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Imperatif: const confirm = useConfirm(); await confirm({ ... }) → boolean
// ---------------------------------------------------------------------------

export type ConfirmOptions = Omit<ConfirmDialogProps, 'open' | 'onClose' | 'onConfirm' | 'loading' | 'danger'> & {
  /** Aksi async opsional; dialog menampilkan loading & error sampai selesai. */
  onConfirm?: () => void | Promise<unknown>;
};

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ options: ConfirmOptions; open: boolean } | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);
  const confirmedRef = useRef(false);

  const confirm = useCallback<ConfirmFn>(options => {
    resolverRef.current?.(false);
    confirmedRef.current = false;
    setState({ options, open: true });
    return new Promise<boolean>(resolve => {
      resolverRef.current = resolve;
    });
  }, []);

  const finish = () => {
    resolverRef.current?.(confirmedRef.current);
    resolverRef.current = null;
    setState(current => (current ? { ...current, open: false } : current));
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state ? (
        <ConfirmDialog
          {...state.options}
          open={state.open}
          onClose={finish}
          onConfirm={() => {
            confirmedRef.current = true;
            const action = state.options.onConfirm?.();
            // Tanpa aksi async → tutup langsung.
            if (action instanceof Promise) {
              return action.catch(error => {
                confirmedRef.current = false;
                throw error;
              });
            }
            finish();
            return undefined;
          }}
        />
      ) : null}
    </ConfirmContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useConfirm(): ConfirmFn {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error('useConfirm harus dipakai di dalam ConfirmProvider');
  return context;
}

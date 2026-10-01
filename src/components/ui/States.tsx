import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, Inbox, Loader2, RefreshCw, ShieldAlert, WifiOff } from 'lucide-react';
import { NetworkError, PermissionError, errorMessage } from '@/api/errors';
import { cn } from '@/lib/object';
import { Button } from './Button';
import { Skeleton, SkeletonDashboard, SkeletonForm, SkeletonStatGrid, SkeletonTable } from './Skeleton';

export { Skeleton };

export type LoadingVariant = 'spinner' | 'table' | 'form' | 'cards' | 'dashboard';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-5 animate-spin text-brand-500', className)} aria-label="Memuat" />;
}

/**
 * Loading. `variant` memilih skeleton yang mirip konten akhir (lebih halus dari spinner):
 * table → di dalam Card berisi DataTable, form → form profil, cards → grid StatCard,
 * dashboard → stat + grafik. Default spinner (untuk gate/halaman penuh).
 */
export function LoadingState({
  label = 'Memuat data…',
  className,
  variant = 'spinner',
}: {
  label?: string;
  className?: string;
  variant?: LoadingVariant;
}) {
  if (variant !== 'spinner') {
    return (
      <div className={className} role="status" aria-busy="true">
        <span className="sr-only">{label}</span>
        {variant === 'table' ? <SkeletonTable /> : null}
        {variant === 'form' ? <SkeletonForm /> : null}
        {variant === 'cards' ? <SkeletonStatGrid /> : null}
        {variant === 'dashboard' ? <SkeletonDashboard /> : null}
      </div>
    );
  }
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-14 text-sm text-fg-subtle', className)} role="status">
      <Spinner className="size-6" />
      {label}
    </div>
  );
}

export function EmptyState({
  title = 'Belum ada data',
  description,
  action,
  icon,
  className,
}: {
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 px-6 py-12 text-center', className)}>
      <div className="mb-1 rounded-full bg-brand-50 p-3 text-brand-500 dark:bg-brand-900/40">
        {icon ?? <Inbox className="size-6" />}
      </div>
      <p className="text-sm font-semibold text-fg">{title}</p>
      {description ? <p className="max-w-md text-sm text-fg-subtle">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

/**
 * Error state. PermissionError ditampilkan khusus sebagai "belum ada izin backend"
 * (terutama untuk role super_admin yang belum dikonfigurasi di Hasura).
 */
export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  if (error instanceof PermissionError) {
    return (
      <div className={cn('flex flex-col items-center gap-2 px-6 py-12 text-center', className)}>
        <div className="mb-1 rounded-full bg-[#FFF6E6] p-3 text-warning dark:bg-warning/15">
          <ShieldAlert className="size-6" />
        </div>
        <p className="text-sm font-semibold text-fg">Belum ada izin backend</p>
        <p className="max-w-lg text-sm text-fg-subtle">
          Role <code className="rounded bg-card-muted px-1 py-0.5 text-xs">{error.role ?? '-'}</code> belum memiliki
          permission Hasura untuk data ini. Minta tim backend menerapkan konfigurasi pada{' '}
          <code className="rounded bg-card-muted px-1 py-0.5 text-xs">docs/superadmin_backend.md</code>.
        </p>
        <p className="max-w-lg break-words font-mono text-xs text-fg-subtle">{error.message}</p>
        {onRetry ? (
          <Button variant="secondary" size="sm" className="mt-2" icon={<RefreshCw className="size-3.5" />} onClick={onRetry}>
            Coba lagi
          </Button>
        ) : null}
      </div>
    );
  }
  const isNetwork = error instanceof NetworkError;
  return (
    <div className={cn('flex flex-col items-center gap-2 px-6 py-12 text-center', className)}>
      <div className="mb-1 rounded-full bg-[#FDEEEE] p-3 text-danger dark:bg-danger/15">
        {isNetwork ? <WifiOff className="size-6" /> : <AlertTriangle className="size-6" />}
      </div>
      <p className="text-sm font-semibold text-fg">{isNetwork ? 'Koneksi bermasalah' : 'Gagal memuat data'}</p>
      <p className="max-w-lg break-words text-sm text-fg-subtle">{errorMessage(error)}</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" className="mt-2" icon={<RefreshCw className="size-3.5" />} onClick={onRetry}>
          Coba lagi
        </Button>
      ) : null}
    </div>
  );
}

/** Helper: render loading/error/konten sesuai status query. Default skeleton tabel. */
export function QueryBoundary({
  isLoading,
  error,
  onRetry,
  children,
  loadingLabel,
  skeleton = 'table',
}: {
  isLoading: boolean;
  error: unknown;
  onRetry?: () => void;
  children: () => ReactNode;
  loadingLabel?: string;
  skeleton?: LoadingVariant;
}) {
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (isLoading) return <LoadingState label={loadingLabel} variant={skeleton} />;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
      {children()}
    </motion.div>
  );
}

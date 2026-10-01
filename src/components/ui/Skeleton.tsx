import { cn } from '@/lib/object';

/** Blok placeholder berdenyut. Atur ukuran lewat className (mis. `h-4 w-32`). */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-card-muted motion-reduce:animate-none', className)} aria-hidden />;
}

const WIDTHS = ['w-11/12', 'w-4/5', 'w-2/3', 'w-3/4', 'w-1/2'];

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2', className)} aria-hidden>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className={cn('h-3', index === lines - 1 ? 'w-1/2' : WIDTHS[index % WIDTHS.length])} />
      ))}
    </div>
  );
}

/** Satu baris list: avatar bulat + 2 baris teks + badge. */
export function SkeletonRow({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-3 px-4 py-3', className)} aria-hidden>
      <Skeleton className="size-8 shrink-0 rounded-full" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Skeleton className="h-3 w-2/5" />
        <Skeleton className="h-2.5 w-1/4" />
      </div>
      <Skeleton className="h-5 w-16 rounded-full" />
    </div>
  );
}

/** Kartu statistik (selaras StatCard). */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-xl border border-line bg-card p-4', className)} aria-hidden>
      <div className="flex items-start justify-between">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="size-7 rounded-lg" />
      </div>
      <Skeleton className="mt-3 h-6 w-16" />
      <Skeleton className="mt-2 h-2.5 w-28" />
    </div>
  );
}

export function SkeletonStatGrid({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid grid-cols-2 gap-3 md:grid-cols-4', className)}>
      {Array.from({ length: count }, (_, index) => (
        <SkeletonCard key={index} />
      ))}
    </div>
  );
}

/** Tabel: toolbar + header + baris. Cocok di dalam <Card> menggantikan DataTable saat loading. */
export function SkeletonTable({ rows = 6, columns = 4, toolbar = true, className }: { rows?: number; columns?: number; toolbar?: boolean; className?: string }) {
  return (
    <div className={cn('flex flex-col', className)} aria-hidden>
      {toolbar ? (
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <Skeleton className="h-9 w-full max-w-64 rounded-lg" />
          <Skeleton className="hidden h-9 w-28 rounded-lg sm:block" />
        </div>
      ) : null}
      <div className="flex gap-4 border-b border-line bg-card-muted/60 px-4 py-3">
        {Array.from({ length: columns }, (_, index) => (
          <Skeleton key={index} className={cn('h-2.5', index === 0 ? 'w-1/4' : 'w-1/6')} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex items-center gap-4 border-b border-line px-4 py-3.5 last:border-0" style={{ opacity: 1 - row * 0.1 }}>
          {Array.from({ length: columns }, (_, col) => (
            <Skeleton key={col} className={cn('h-3', col === 0 ? 'w-1/4' : col % 2 ? 'w-1/6' : 'w-1/8')} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Form: pasangan label + input. */
export function SkeletonForm({ fields = 4, className }: { fields?: number; className?: string }) {
  return (
    <div className={cn('grid gap-4 p-5 sm:grid-cols-2', className)} aria-hidden>
      {Array.from({ length: fields }, (_, index) => (
        <div key={index} className={cn('flex flex-col gap-2', index === 0 && 'sm:col-span-2')}>
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      ))}
      <Skeleton className="h-10 w-36 rounded-lg" />
    </div>
  );
}

/** Ringkasan dashboard: grid stat + 2 kartu grafik. */
export function SkeletonDashboard({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col gap-5', className)} aria-hidden>
      <SkeletonStatGrid count={8} />
      <div className="grid gap-5 lg:grid-cols-2">
        {[0, 1].map(index => (
          <div key={index} className="rounded-xl border border-line bg-card p-4">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-1.5 h-2.5 w-56" />
            <Skeleton className="mt-5 h-56 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}

import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronLeft } from 'lucide-react';

export function PageHeader({
  title,
  description,
  actions,
  backTo,
  backLabel = 'Kembali',
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  backTo?: string;
  backLabel?: string;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {backTo ? (
          <Link to={backTo} className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline dark:text-brand-300">
            <ChevronLeft className="size-3.5" />
            {backLabel}
          </Link>
        ) : null}
        <h1 className="text-xl font-semibold tracking-tight text-fg">{title}</h1>
        {description ? <p className="mt-1 text-sm text-fg-subtle">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

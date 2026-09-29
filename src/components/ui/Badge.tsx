import type { ReactNode } from 'react';
import { cn } from '@/lib/object';
import type { ImmunizationRecordStatus, SessionStatus } from '@/api/types';

export type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

const TONES: Record<Tone, string> = {
  neutral: 'bg-card-muted text-fg-muted',
  brand: 'bg-brand-100 text-brand-700 dark:bg-brand-900/60 dark:text-brand-300',
  success: 'bg-[#EAF8F0] text-[#1E874A] dark:bg-success/15 dark:text-[#6fd39a]',
  warning: 'bg-[#FFF6E6] text-[#9A6A12] dark:bg-warning/15 dark:text-[#f0c774]',
  danger: 'bg-[#FDEEEE] text-[#B42318] dark:bg-danger/15 dark:text-[#f59a9a]',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export const SESSION_STATUS_LABEL: Record<SessionStatus, string> = {
  draft: 'Draf',
  active: 'Aktif',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
};

const SESSION_STATUS_TONE: Record<SessionStatus, Tone> = {
  draft: 'neutral',
  active: 'brand',
  completed: 'success',
  cancelled: 'danger',
};

export function SessionStatusBadge({ status }: { status: SessionStatus }) {
  return <Badge tone={SESSION_STATUS_TONE[status] ?? 'neutral'}>{SESSION_STATUS_LABEL[status] ?? status}</Badge>;
}

export const IMMUNIZATION_STATUS_LABEL: Record<ImmunizationRecordStatus, string> = {
  given: 'Diberikan',
  deferred: 'Ditunda',
  refused: 'Ditolak',
  absent: 'Tidak hadir',
};

const IMMUNIZATION_STATUS_TONE: Record<ImmunizationRecordStatus, Tone> = {
  given: 'success',
  deferred: 'warning',
  refused: 'danger',
  absent: 'neutral',
};

export function ImmunizationStatusBadge({ status }: { status: ImmunizationRecordStatus }) {
  return (
    <Badge tone={IMMUNIZATION_STATUS_TONE[status] ?? 'neutral'}>{IMMUNIZATION_STATUS_LABEL[status] ?? status}</Badge>
  );
}

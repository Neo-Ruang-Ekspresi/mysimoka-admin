import type { ReactNode } from 'react';
import { Badge, type Tone } from '@/components/ui/Badge';
import type { StatusItem } from '@/components/charts/ReportCharts';
import { formatDecimal } from '@/lib/format';
import {
  BMI_STATUS_COLORS,
  BMI_STATUS_LABEL,
  BMI_STATUS_RANGE,
  BMI_STATUSES,
  HEIGHT_STATUS_COLORS,
  HEIGHT_STATUS_LABEL,
  HEIGHT_STATUS_RANGE,
  HEIGHT_STATUSES,
  NOT_COMPUTED_COLOR,
  type BmiStatus,
  type HeightStatus,
} from '@/lib/growth';
import type { StatusCounts } from '@/lib/growthReport';

export function bmiStatusItems(counts: StatusCounts<BmiStatus>, withNotComputed = true): StatusItem[] {
  const items: StatusItem[] = BMI_STATUSES.map(key => ({
    key,
    label: BMI_STATUS_LABEL[key],
    color: BMI_STATUS_COLORS[key],
    count: counts[key],
    hint: BMI_STATUS_RANGE[key],
  }));
  if (withNotComputed && counts.notComputed > 0) {
    items.push({ key: 'notComputed', label: 'Tidak dihitung', color: NOT_COMPUTED_COLOR, count: counts.notComputed, hint: '<5 th / data kurang' });
  }
  return items;
}

export function heightStatusItems(counts: StatusCounts<HeightStatus>, withNotComputed = true): StatusItem[] {
  const items: StatusItem[] = HEIGHT_STATUSES.map(key => ({
    key,
    label: HEIGHT_STATUS_LABEL[key],
    color: HEIGHT_STATUS_COLORS[key],
    count: counts[key],
    hint: HEIGHT_STATUS_RANGE[key],
  }));
  if (withNotComputed && counts.notComputed > 0) {
    items.push({ key: 'notComputed', label: 'Tidak dihitung', color: NOT_COMPUTED_COLOR, count: counts.notComputed, hint: '<5 th / data kurang' });
  }
  return items;
}

const BMI_TONE: Record<BmiStatus, Tone> = {
  gizi_buruk: 'danger',
  gizi_kurang: 'warning',
  gizi_baik: 'success',
  gizi_lebih: 'brand',
  obesitas: 'danger',
};

const HEIGHT_TONE: Record<HeightStatus, Tone> = {
  sangat_pendek: 'danger',
  pendek: 'warning',
  normal: 'success',
  tinggi: 'brand',
};

export function BmiStatusBadge({ status, reason }: { status: BmiStatus | null; reason?: string | null }) {
  if (!status) return <span className="text-xs text-fg-subtle" title={reason ?? undefined}>Tidak dihitung</span>;
  return <Badge tone={BMI_TONE[status]}>{BMI_STATUS_LABEL[status]}</Badge>;
}

export function HeightStatusBadge({ status }: { status: HeightStatus | null }) {
  if (!status) return <span className="text-xs text-fg-subtle">-</span>;
  return <Badge tone={HEIGHT_TONE[status]}>{HEIGHT_STATUS_LABEL[status]}</Badge>;
}

export function formatZ(z: number | null | undefined): string {
  if (z === null || z === undefined || !Number.isFinite(z)) return '-';
  return `${z > 0 ? '+' : ''}${formatDecimal(z, 2)}`;
}

export function formatAgeMonths(months: number | null | undefined): string {
  if (months === null || months === undefined) return '-';
  const whole = Math.floor(months);
  return `${Math.floor(whole / 12)} th ${whole % 12} bln`;
}

/** Catatan metodologi kecil di bawah kartu. */
export function MethodNote({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-xs leading-relaxed text-fg-subtle">{children}</p>;
}

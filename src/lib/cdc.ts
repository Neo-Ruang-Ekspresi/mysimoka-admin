/**
 * Pembanding CDC 2000 (persentil IMT/U, 2–20 th). Hanya informasi: status resmi tetap
 * Permenkes 2/2020 / WHO 2007 (nutrition.ts). Kategori CDC: < P5 berat badan kurang,
 * P5–< P85 sehat, P85–< P95 berat badan lebih, ≥ P95 obesitas.
 */
import { CDC_BMI_FOR_AGE, type CdcLms } from './cdcReference';
import type { Sex } from './growth';

export type CdcCategory = 'BB kurang' | 'Sehat' | 'BB lebih' | 'Obesitas';

function lmsAt(table: readonly CdcLms[], months: number): [number, number, number] | null {
  if (table.length === 0 || months < table[0][0] || months > table[table.length - 1][0]) return null;
  for (let i = 0; i < table.length - 1; i += 1) {
    const a = table[i];
    const b = table[i + 1];
    if (months >= a[0] && months <= b[0]) {
      const t = b[0] === a[0] ? 0 : (months - a[0]) / (b[0] - a[0]);
      return [a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2]), a[3] + t * (b[3] - a[3])];
    }
  }
  const last = table[table.length - 1];
  return [last[1], last[2], last[3]];
}

/** Fungsi distribusi normal baku (Abramowitz–Stegun 7.1.26, galat < 1.5e-7). */
function normalCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/** Persentil IMT/U CDC 2000 (0–100); null di luar 24–240.5 bulan atau data kurang. */
export function cdcBmiPercentile(bmi: number | null, sex: Sex | null, months: number | null): number | null {
  if (bmi === null || !sex || months === null) return null;
  const lms = lmsAt(CDC_BMI_FOR_AGE[sex], months);
  if (!lms) return null;
  const [l, m, s] = lms;
  const z = Math.abs(l) < 1e-9 ? Math.log(bmi / m) / s : (Math.pow(bmi / m, l) - 1) / (l * s);
  return Number.isFinite(z) ? normalCdf(z) * 100 : null;
}

/** z untuk persentil batas kategori CDC. */
export const CDC_CUTOFF_Z = { 5: -1.6449, 85: 1.0364, 95: 1.6449 } as const;

/** IMT pada persentil batas (P5/P85/P95) untuk usia & jenis kelamin; null di luar 2–20 th. */
export function cdcBmiAtPercentile(sex: Sex | null, months: number | null, percentile: keyof typeof CDC_CUTOFF_Z): number | null {
  if (!sex || months === null) return null;
  const lms = lmsAt(CDC_BMI_FOR_AGE[sex], months);
  if (!lms) return null;
  const [l, m, s] = lms;
  const z = CDC_CUTOFF_Z[percentile];
  return Math.abs(l) < 1e-9 ? m * Math.exp(s * z) : m * Math.pow(1 + l * s * z, 1 / l);
}

export function cdcCategory(percentile: number | null): CdcCategory | null {
  if (percentile === null) return null;
  if (percentile < 5) return 'BB kurang';
  if (percentile < 85) return 'Sehat';
  if (percentile < 95) return 'BB lebih';
  return 'Obesitas';
}

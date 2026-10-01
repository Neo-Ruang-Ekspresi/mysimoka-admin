/**
 * Status gizi anak usia sekolah berbasis WHO Growth Reference 2007 (5–19 tahun),
 * kategori mengikuti Permenkes RI No. 2 Tahun 2020 tentang Standar Antropometri Anak.
 *
 * Algoritma z-score sama dengan paket resmi WHO `anthroplus`:
 *  - usia (bulan) = selisih hari / (365.25 / 12); LMS diinterpolasi linear antar bulan;
 *  - z = ((y/M)^L − 1) / (L·S);
 *  - IMT/U memakai koreksi "adjusted" untuk |z| > 3 (SD3/SD23), TB/U tidak (L = 1).
 * Usia < 61 bulan (standar WHO 2006) atau > 228 bulan → tidak dihitung.
 */
import { BMI_FOR_AGE, HEIGHT_FOR_AGE, WHO2007_MAX_MONTH, WHO2007_MIN_MONTH, type Lms } from './growthReference';
import { parseDate } from './format';

export type Sex = 'male' | 'female';

export function normalizeSex(value: string | null | undefined): Sex | null {
  if (value === 'male' || value === 'L') return 'male';
  if (value === 'female' || value === 'P') return 'female';
  return null;
}

const DAYS_PER_MONTH = 365.25 / 12;

/** Usia dalam bulan (desimal) pada tanggal `at`. */
export function ageInMonths(dateOfBirth: string | null | undefined, at: string | Date | null | undefined): number | null {
  const dob = parseDate(dateOfBirth);
  const when = at instanceof Date ? at : parseDate(at ?? null);
  if (!dob || !when) return null;
  const dobUtc = Date.UTC(dob.getFullYear(), dob.getMonth(), dob.getDate());
  const atUtc = Date.UTC(when.getFullYear(), when.getMonth(), when.getDate());
  const days = (atUtc - dobUtc) / 86_400_000;
  return days >= 0 ? days / DAYS_PER_MONTH : null;
}

export function inReferenceRange(months: number | null): months is number {
  return months !== null && months >= WHO2007_MIN_MONTH && months <= WHO2007_MAX_MONTH;
}

/** LMS terinterpolasi linear (cara anthroplus). */
export function lmsAt(table: readonly Lms[], months: number): Lms | null {
  if (!inReferenceRange(months)) return null;
  const low = Math.floor(months);
  const diff = months - low;
  const a = table[low - WHO2007_MIN_MONTH];
  if (!a) return null;
  const b = table[low + 1 - WHO2007_MIN_MONTH];
  if (diff <= 0 || !b) return a;
  return [a[0] + diff * (b[0] - a[0]), a[1] + diff * (b[1] - a[1]), a[2] + diff * (b[2] - a[2])];
}

function rawZ(y: number, [l, m, s]: Lms): number {
  return Math.abs(l) < 1e-9 ? Math.log(y / m) / s : (Math.pow(y / m, l) - 1) / (l * s);
}

/** Nilai pengukuran pada z tertentu (untuk kurva referensi). */
export function valueAtZ([l, m, s]: Lms, z: number): number {
  return Math.abs(l) < 1e-9 ? m * Math.exp(s * z) : m * Math.pow(1 + l * s * z, 1 / l);
}

function adjustedZ(y: number, lms: Lms): number {
  const z = rawZ(y, lms);
  if (z > 3) {
    const sd3 = valueAtZ(lms, 3);
    const sd23 = sd3 - valueAtZ(lms, 2);
    return 3 + (y - sd3) / sd23;
  }
  if (z < -3) {
    const sd3 = valueAtZ(lms, -3);
    const sd23 = valueAtZ(lms, -2) - sd3;
    return -3 + (y - sd3) / sd23;
  }
  return z;
}

export function bmiForAgeZ(bmi: number | null, sex: Sex | null, months: number | null): number | null {
  if (bmi === null || !sex || months === null) return null;
  const lms = lmsAt(BMI_FOR_AGE[sex], months);
  if (!lms) return null;
  const z = adjustedZ(bmi, lms);
  return Number.isFinite(z) ? z : null;
}

export function heightForAgeZ(heightCm: number | null, sex: Sex | null, months: number | null): number | null {
  if (heightCm === null || !sex || months === null) return null;
  const lms = lmsAt(HEIGHT_FOR_AGE[sex], months);
  if (!lms) return null;
  const z = rawZ(heightCm, lms);
  return Number.isFinite(z) ? z : null;
}

// ---------------------------------------------------------------------------
// Kategori (Permenkes 2/2020, anak 5–18 tahun)
// ---------------------------------------------------------------------------

export type BmiStatus = 'gizi_buruk' | 'gizi_kurang' | 'gizi_baik' | 'gizi_lebih' | 'obesitas';
export const BMI_STATUSES: BmiStatus[] = ['gizi_buruk', 'gizi_kurang', 'gizi_baik', 'gizi_lebih', 'obesitas'];

export const BMI_STATUS_LABEL: Record<BmiStatus, string> = {
  gizi_buruk: 'Gizi buruk',
  gizi_kurang: 'Gizi kurang',
  gizi_baik: 'Gizi baik',
  gizi_lebih: 'Gizi lebih',
  obesitas: 'Obesitas',
};

export const BMI_STATUS_RANGE: Record<BmiStatus, string> = {
  gizi_buruk: 'z < −3',
  gizi_kurang: '−3 ≤ z < −2',
  gizi_baik: '−2 ≤ z ≤ +1',
  gizi_lebih: '+1 < z ≤ +2',
  obesitas: 'z > +2',
};

/**
 * Palet ordinal (kurang → baik → lebih), divalidasi dataviz validate_palette (light & dark lulus;
 * kontras rendah → selalu disertai label/tabel).
 */
export const BMI_STATUS_COLORS: Record<BmiStatus, string> = {
  gizi_buruk: '#C0392B',
  gizi_kurang: '#C8841F',
  gizi_baik: '#2A9D8F',
  gizi_lebih: '#4F86E8',
  obesitas: '#8E44AD',
};

export const NOT_COMPUTED_COLOR = '#94A3B8';

export function bmiStatus(z: number | null): BmiStatus | null {
  if (z === null) return null;
  if (z < -3) return 'gizi_buruk';
  if (z < -2) return 'gizi_kurang';
  if (z <= 1) return 'gizi_baik';
  if (z <= 2) return 'gizi_lebih';
  return 'obesitas';
}

export type HeightStatus = 'sangat_pendek' | 'pendek' | 'normal' | 'tinggi';
export const HEIGHT_STATUSES: HeightStatus[] = ['sangat_pendek', 'pendek', 'normal', 'tinggi'];

export const HEIGHT_STATUS_LABEL: Record<HeightStatus, string> = {
  sangat_pendek: 'Sangat pendek',
  pendek: 'Pendek',
  normal: 'Normal',
  tinggi: 'Tinggi',
};

export const HEIGHT_STATUS_RANGE: Record<HeightStatus, string> = {
  sangat_pendek: 'z < −3',
  pendek: '−3 ≤ z < −2',
  normal: '−2 ≤ z ≤ +3',
  tinggi: 'z > +3',
};

export const HEIGHT_STATUS_COLORS: Record<HeightStatus, string> = {
  sangat_pendek: '#C0392B',
  pendek: '#C8841F',
  normal: '#2A9D8F',
  tinggi: '#4F86E8',
};

export function heightStatus(z: number | null): HeightStatus | null {
  if (z === null) return null;
  if (z < -3) return 'sangat_pendek';
  if (z < -2) return 'pendek';
  if (z <= 3) return 'normal';
  return 'tinggi';
}

/** Alasan z-score tidak dihitung (untuk tooltip/tabel). */
export function notComputedReason(sex: Sex | null, months: number | null): string | null {
  if (!sex) return 'Jenis kelamin kosong';
  if (months === null) return 'Tanggal lahir kosong';
  if (months < WHO2007_MIN_MONTH) return 'Usia < 5 th (standar WHO 2006, tidak dihitung)';
  if (months > WHO2007_MAX_MONTH) return 'Usia > 19 th';
  return null;
}

/** Kurva referensi SD (−3, −2, 0, +2, +3) untuk rentang usia (bulan). */
export const REFERENCE_SDS = [-3, -2, 0, 2, 3] as const;

export function referenceCurve(
  indicator: 'bmi' | 'height',
  sex: Sex,
  fromMonth: number,
  toMonth: number,
): Array<{ months: number; sd: Record<(typeof REFERENCE_SDS)[number], number> }> {
  const table = indicator === 'bmi' ? BMI_FOR_AGE[sex] : HEIGHT_FOR_AGE[sex];
  const start = Math.max(WHO2007_MIN_MONTH, Math.floor(fromMonth));
  const end = Math.min(WHO2007_MAX_MONTH, Math.ceil(toMonth));
  const rows = [];
  for (let month = start; month <= end; month += 1) {
    const lms = table[month - WHO2007_MIN_MONTH];
    if (!lms) continue;
    rows.push({
      months: month,
      sd: {
        [-3]: valueAtZ(lms, -3),
        [-2]: valueAtZ(lms, -2),
        0: lms[1],
        2: valueAtZ(lms, 2),
        3: valueAtZ(lms, 3),
      } as Record<(typeof REFERENCE_SDS)[number], number>,
    });
  }
  return rows;
}

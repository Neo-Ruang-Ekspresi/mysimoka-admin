/**
 * Status gizi satu pengukuran — satu sumber untuk seluruh dashboard (daftar siswa, detail sesi,
 * ringkasan, ekspor):
 *  - usia 5–19 th (61–228 bulan): IMT/U z-score WHO Growth Reference 2007
 *    (https://www.who.int/tools/growth-reference-data-for-5to19-years), kategori Permenkes RI
 *    No. 2/2020; tergantung jenis kelamin & usia saat diukur (lib/growth.ts);
 *  - usia > 19 th: ambang IMT dewasa Kemenkes (< 17 / 18,5 / 25 / 27), dipetakan ke label yang sama;
 *  - jenis kelamin / tanggal lahir kosong atau usia < 5 th: null ("tidak dihitung"), tidak menebak.
 */
import type { StudentRow } from '@/api/types';
import {
  ageInMonths,
  BMI_STATUS_COLORS,
  BMI_STATUS_LABEL,
  bmiForAgeZ,
  bmiStatus,
  normalizeSex,
  type BmiStatus,
} from './growth';
import { WHO2007_MAX_MONTH } from './growthReference';

export type NutritionCategory = (typeof BMI_STATUS_LABEL)[BmiStatus];

const STATUS_ORDER: BmiStatus[] = ['gizi_buruk', 'gizi_kurang', 'gizi_baik', 'gizi_lebih', 'obesitas'];

export const NUTRITION_CATEGORIES: NutritionCategory[] = STATUS_ORDER.map(key => BMI_STATUS_LABEL[key]);

export const NUTRITION_COLORS: Record<NutritionCategory, string> = Object.fromEntries(
  STATUS_ORDER.map(key => [BMI_STATUS_LABEL[key], BMI_STATUS_COLORS[key]]),
) as Record<NutritionCategory, string>;

export function computeBmi(heightCm: number | null, weightKg: number | null): number | null {
  if (!heightCm || !weightKg || heightCm <= 0 || weightKg <= 0) return null;
  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);
  return Number.isFinite(bmi) ? bmi : null;
}

/** Ambang IMT dewasa Kemenkes (> 19 th). */
function adultStatus(bmi: number): BmiStatus {
  if (bmi < 17) return 'gizi_buruk';
  if (bmi < 18.5) return 'gizi_kurang';
  if (bmi <= 25) return 'gizi_baik';
  if (bmi <= 27) return 'gizi_lebih';
  return 'obesitas';
}

export type NutritionSubject = Pick<StudentRow, 'gender' | 'date_of_birth'>;

/** Status gizi pada tanggal ukur `measuredAt`; null bila tidak bisa dihitung (lihat atas). */
export function nutritionStatus(
  bmi: number | null,
  student: NutritionSubject | null | undefined,
  measuredAt: string | null | undefined,
): NutritionCategory | null {
  if (bmi === null || !student) return null;
  const months = ageInMonths(student.date_of_birth, measuredAt);
  if (months !== null && months > WHO2007_MAX_MONTH) return BMI_STATUS_LABEL[adultStatus(bmi)];
  const status = bmiStatus(bmiForAgeZ(bmi, normalizeSex(student.gender), months));
  return status ? BMI_STATUS_LABEL[status] : null;
}

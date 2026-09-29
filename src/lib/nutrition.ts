/**
 * Kategori status gizi — MENGIKUTI app mobile (getBmiCategory di mysimoka/src/services/auth.ts):
 * ambang IMT dewasa 18.5 / 25 / 30. Untuk anak usia SD standar yang tepat adalah IMT/U
 * (z-score WHO 2007 / Permenkes 2/2020) — lihat README "Known gaps".
 */
export type NutritionCategory = 'Kurus' | 'Normal' | 'Gemuk' | 'Obes';

export const NUTRITION_CATEGORIES: NutritionCategory[] = ['Kurus', 'Normal', 'Gemuk', 'Obes'];

// Warna sama dengan bmiCategoryData di mobile.
export const NUTRITION_COLORS: Record<NutritionCategory, string> = {
  Kurus: '#E2A93B',
  Normal: '#27AE60',
  Gemuk: '#2D9CDB',
  Obes: '#EB5757',
};

export function computeBmi(heightCm: number | null, weightKg: number | null): number | null {
  if (!heightCm || !weightKg || heightCm <= 0 || weightKg <= 0) return null;
  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);
  return Number.isFinite(bmi) ? bmi : null;
}

export function bmiCategory(bmi: number | null): NutritionCategory | null {
  if (bmi === null) return null;
  if (bmi < 18.5) return 'Kurus';
  if (bmi < 25) return 'Normal';
  if (bmi < 30) return 'Gemuk';
  return 'Obes';
}

/**
 * Kolom "data pembanding" pada student_measurement_records (reference_weight_kg,
 * reference_height_cm): nilai alat pembanding yang diketik guru saat menguji perangkat.
 *
 * Backend lama belum punya kolomnya → Hasura menolak SELURUH query ("field 'reference_...' not
 * found"). Query dicoba dengan kolom tsb; bila ditolak, diulang tanpa kolom dan diingat per
 * sesi aplikasi (variabel modul) supaya query berikutnya langsung tanpa kolom.
 */
import { readNumber } from '@/lib/object';
import type { MeasurementRecordRow } from './types';

const REFERENCE_FIELDS = 'reference_weight_kg reference_height_cm';

/**
 * Sementara disembunyikan: false → input form, detail, riwayat, dan kolom ekspor pembanding tidak
 * tampil (data di backend tetap utuh, tidak ditimpa). Ubah ke true untuk menampilkan lagi.
 */
export const SHOW_REFERENCE = false;

let referenceSupported = true;

function isMissingReferenceField(error: unknown): boolean {
  return error instanceof Error && /reference_/i.test(error.message) && /not found|no such|does not exist/i.test(error.message);
}

/** false setelah backend terbukti belum punya kolom pembanding (form menyembunyikan input). */
export function isReferenceSupported(): boolean {
  return SHOW_REFERENCE && referenceSupported;
}

/** Field `_set`/insert untuk kolom pembanding; kosong bila tidak dikirim (undefined). */
export function referenceColumns(input: { referenceWeightKg?: number | null; referenceHeightCm?: number | null }): Record<string, number | null> {
  return {
    ...(input.referenceWeightKg !== undefined ? { reference_weight_kg: input.referenceWeightKg } : {}),
    ...(input.referenceHeightCm !== undefined ? { reference_height_cm: input.referenceHeightCm } : {}),
  };
}

/** Jalankan query dengan field record + kolom pembanding (bila didukung backend). */
export async function withReferenceFields<T>(baseFields: string, run: (fields: string) => Promise<T>): Promise<T> {
  if (!referenceSupported) return run(baseFields);
  try {
    return await run(`${baseFields} ${REFERENCE_FIELDS}`);
  } catch (error) {
    if (!isMissingReferenceField(error)) throw error;
    referenceSupported = false;
    return run(baseFields);
  }
}

export type MeasurementReference = {
  weightKg: number | null;
  heightCm: number | null;
  /** Selisih terukur - pembanding. */
  weightDiff: number | null;
  heightDiff: number | null;
};

/** Nilai pembanding + selisih dari satu record; null bila kedua pembanding kosong. */
export function readReference(record: MeasurementRecordRow | null | undefined): MeasurementReference | null {
  if (!SHOW_REFERENCE || !record) return null;
  const weightKg = readNumber(record.reference_weight_kg);
  const heightCm = readNumber(record.reference_height_cm);
  if (weightKg === null && heightCm === null) return null;
  return {
    weightKg,
    heightCm,
    weightDiff: referenceDiff(readNumber(record.weight_kg), weightKg),
    heightDiff: referenceDiff(readNumber(record.height_cm), heightCm),
  };
}

/** Selisih = terukur - pembanding (null bila salah satu kosong). */
export function referenceDiff(measured: number | null | undefined, reference: number | null | undefined): number | null {
  if (measured == null || reference == null) return null;
  return Math.round((measured - reference) * 100) / 100;
}

/** "+0.3 kg" / "-0.5 cm" / "0 kg". */
export function formatReferenceDiff(value: number | null, unit: string): string {
  if (value === null) return '-';
  const text = value.toLocaleString('id-ID', { maximumFractionDigits: 2 });
  return `${value > 0 ? '+' : ''}${text} ${unit}`;
}

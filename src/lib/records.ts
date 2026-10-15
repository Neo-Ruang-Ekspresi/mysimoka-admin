/** Label & util tampilan record pengukuran/imunisasi (dipakai detail, tabel sesi, drawer siswa). */
import type { HistoryEntry } from '@/api/recordHistory';

export const CAPTURE_SOURCE_LABEL: Record<string, string> = {
  manual_form: 'Input manual',
  device_ble: 'Perangkat BLE',
  face_identification: 'Identifikasi wajah',
  batch: 'Batch',
  height_pose: 'Height pose',
};

export const CAPTURE_METHOD_LABEL: Record<string, string> = {
  manual: 'Manual',
  automatic: 'Otomatis (perangkat)',
};

export function captureSourceLabel(value: string | null | undefined): string {
  return value ? (CAPTURE_SOURCE_LABEL[value] ?? value) : '-';
}

export function captureMethodLabel(value: string | null | undefined): string {
  return value ? (CAPTURE_METHOD_LABEL[value] ?? value) : '-';
}

/**
 * Jumlah percobaan nyata untuk satu record. Baris 'backfill' hanya mewakili keadaan awal
 * (bukan pengukuran baru) sehingga tetap dihitung 1 bila hanya itu yang ada. Minimal 1 bila
 * record ada.
 */
export function attemptCount(entries: HistoryEntry[] | undefined, hasRecord = true): number {
  const count = entries?.length ?? 0;
  return Math.max(count, hasRecord ? 1 : 0);
}

/** Nama pengguna dari map anggota; fallback potongan id. */
export function userLabel(names: Map<string, string>, userId: string | null | undefined): string {
  if (!userId) return '-';
  return names.get(userId) ?? `Pengguna ${userId.slice(0, 8)}`;
}

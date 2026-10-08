/**
 * Pemilihan data untuk Laporan Uji Alat: baris `device_calibrations` → cek akurasi yang dipakai
 * → pasangan (bacaan, acuan) untuk `agreementStats`.
 */
import type { CalibrationMeasure, CalibrationRow } from '@/api/crud/calibrations';
import type { Pair } from './agreementStats';

export const NO_BATCH = '__tanpa_sesi__';

export function batchKey(row: CalibrationRow): string {
  return row.batch_id ?? NO_BATCH;
}

/** Perintah ke alat yang mengubah hasil ukuran `measure` (reset mengubah keduanya). */
export function isAdjustmentFor(row: CalibrationRow, measure: CalibrationMeasure): boolean {
  if (row.kind === 'reset') return true;
  if (measure === 'weight') return row.kind === 'adjust_weight' || row.kind === 'tare';
  return row.kind === 'adjust_height';
}

export type SetupSession = {
  key: string;
  startedAt: string;
  endedAt: string;
  checkCount: number;
};

function byTimeAsc(a: CalibrationRow, b: CalibrationRow) {
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
}

/** Tanggal lokal `YYYY-MM-DD` dari timestamp. */
export function localDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function inRange(row: CalibrationRow, from: string, to: string): boolean {
  const day = localDate(row.created_at);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

/** Sesi setup (batch) yang punya cek untuk ukuran ini, terbaru dulu. */
export function setupSessions(rows: CalibrationRow[], measure: CalibrationMeasure, from = '', to = ''): SetupSession[] {
  const map = new Map<string, SetupSession>();
  for (const row of rows) {
    if (row.kind !== 'check' || row.measure !== measure || !inRange(row, from, to)) continue;
    const key = batchKey(row);
    const current = map.get(key);
    if (!current) map.set(key, { key, startedAt: row.created_at, endedAt: row.created_at, checkCount: 1 });
    else {
      current.checkCount += 1;
      if (row.created_at < current.startedAt) current.startedAt = row.created_at;
      if (row.created_at > current.endedAt) current.endedAt = row.created_at;
    }
  }
  return [...map.values()].sort((a, b) => (a.endedAt < b.endedAt ? 1 : -1));
}

export type CheckSelection = {
  /** Semua cek dalam cakupan (sesi + tanggal), urut waktu, dengan status dipakai. */
  checks: Array<{ row: CalibrationRow; used: boolean; reason: string | null }>;
  usedChecks: CalibrationRow[];
  excludedCount: number;
  /** Kunci sesi yang dipakai (null = semua). */
  sessionKey: string | null;
};

export type SelectionOptions = {
  measure: CalibrationMeasure;
  /** 'latest' | 'all' | kunci batch */
  session: string;
  from: string;
  to: string;
  excludeBeforeAdjustment: boolean;
};

/**
 * Pilih cek akurasi. Bila `excludeBeforeAdjustment`, per sesi (batch) hanya cek SETELAH perintah
 * kalibrasi terakhir untuk ukuran ini yang dipakai. Bila baris kalibrasinya tidak tercatat tetapi
 * ada cek bertanda `ok_after_adjustment`, hanya cek bertanda itu yang dipakai.
 */
export function selectChecks(deviceRows: CalibrationRow[], options: SelectionOptions): CheckSelection {
  const { measure, from, to } = options;
  let sessionKey: string | null = null;
  if (options.session === 'latest') sessionKey = setupSessions(deviceRows, measure, from, to)[0]?.key ?? null;
  else if (options.session !== 'all') sessionKey = options.session;

  const scoped = deviceRows
    .filter(row => (sessionKey === null || batchKey(row) === sessionKey) && inRange(row, from, to))
    .sort(byTimeAsc);

  const lastAdjustAt = new Map<string, string>();
  const hasAfterFlag = new Set<string>();
  for (const row of scoped) {
    if (isAdjustmentFor(row, measure)) lastAdjustAt.set(batchKey(row), row.created_at);
    if (row.kind === 'check' && row.measure === measure && row.result === 'ok_after_adjustment') hasAfterFlag.add(batchKey(row));
  }

  const checks = scoped
    .filter(row => row.kind === 'check' && row.measure === measure)
    .map(row => {
      if (!row.readings || row.readings.length === 0 || row.reference_value === null)
        return { row, used: false, reason: 'Tanpa bacaan/acuan' };
      if (!options.excludeBeforeAdjustment) return { row, used: true, reason: null };
      const key = batchKey(row);
      const adjustAt = lastAdjustAt.get(key);
      if (adjustAt !== undefined) {
        return row.created_at > adjustAt
          ? { row, used: true, reason: null }
          : { row, used: false, reason: 'Sebelum kalibrasi' };
      }
      if (hasAfterFlag.has(key) && row.result !== 'ok_after_adjustment')
        return { row, used: false, reason: 'Sebelum kalibrasi' };
      return { row, used: true, reason: null };
    });

  const usedChecks = checks.filter(item => item.used).map(item => item.row);
  return { checks, usedChecks, excludedCount: checks.length - usedChecks.length, sessionKey };
}

/** Setiap bacaan = satu pasangan (bacaan, acuan). */
export function pairsFromChecks(checks: CalibrationRow[]): Pair[] {
  const pairs: Pair[] = [];
  for (const row of checks) {
    if (row.reference_value === null || !row.readings) continue;
    for (const reading of row.readings) pairs.push({ reference: row.reference_value, reading });
  }
  return pairs;
}

/** Toleransi dari cek terbaru yang dipakai (tersimpan per cek); `null` bila tidak ada. */
export function toleranceFromChecks(checks: CalibrationRow[]): { value: number | null; mixed: boolean } {
  const values = checks.map(row => row.tolerance).filter((v): v is number => v !== null && v > 0);
  if (values.length === 0) return { value: null, mixed: false };
  const latest = [...checks].sort(byTimeAsc).reverse().find(row => row.tolerance !== null && row.tolerance > 0);
  return { value: latest?.tolerance ?? values[0], mixed: new Set(values).size > 1 };
}

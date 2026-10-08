/**
 * Cek akurasi & kalibrasi perangkat SmartGrowth (diisi app mobile) + batas toleransi.
 *
 *  - `device_calibrations`: log append-only. kind 'check' = cek akurasi satu titik acuan
 *    (readings, mean_value, bias, abs_error, pct_error, sd, tolerance, within_tolerance);
 *    'tare' | 'adjust_weight' | 'adjust_height' | 'reset' = perintah kalibrasi ke alat.
 *    Permission: teacher/school_admin select sekolah sendiri, super_admin select semua.
 *  - `calibration_settings`: baris sekolah (school_id) atau global (school_id NULL).
 *    school_admin insert/update baris sekolahnya, super_admin semua (termasuk global).
 *
 * Tabel belum di-deploy → fetch mengembalikan `unavailable` agar halaman Perangkat tetap jalan.
 */
import { gql } from '../graphql';
import { ApiError, PermissionError } from '../errors';
import { getAuthSession } from '../session';
import { readUserIdFromToken } from '@/lib/jwt';
import { isFieldNotFound } from './devices';

export type CalibrationKind = 'check' | 'tare' | 'adjust_weight' | 'adjust_height' | 'reset';
export type CalibrationMeasure = 'weight' | 'height';

export const CALIBRATION_KIND_LABEL: Record<CalibrationKind, string> = {
  check: 'Cek akurasi',
  tare: 'Tare',
  adjust_weight: 'Kalibrasi berat',
  adjust_height: 'Kalibrasi tinggi',
  reset: 'Reset kalibrasi',
};

/** Batas bawaan bila belum ada pengaturan (sama dengan app mobile). */
export const DEFAULT_WEIGHT_TOLERANCE_KG = 0.1;
export const DEFAULT_HEIGHT_TOLERANCE_CM = 0.5;

export type CalibrationRow = {
  id: string;
  device_id: string | null;
  device_key: string | null;
  ble_id: string | null;
  device_name: string | null;
  performed_by: string | null;
  batch_id: string | null;
  kind: CalibrationKind | string;
  measure: CalibrationMeasure | null;
  reference_value: number | null;
  readings: number[] | null;
  n: number | null;
  mean_value: number | null;
  bias: number | null;
  abs_error: number | null;
  pct_error: number | null;
  sd: number | null;
  tolerance: number | null;
  within_tolerance: boolean | null;
  zero_offset: number | null;
  cal_factor: number | null;
  height_offset_cm: number | null;
  previous_values: Record<string, number> | null;
  result: string;
  firmware_version: string | null;
  created_at: string;
};

const CALIBRATION_FIELDS =
  'id device_id device_key ble_id device_name performed_by batch_id kind measure reference_value readings n mean_value bias abs_error pct_error sd tolerance within_tolerance zero_offset cal_factor height_offset_cm previous_values result firmware_version created_at';

export const CALIBRATION_LIMIT = 2000;

export type CalibrationsResult =
  | { status: 'ok'; rows: CalibrationRow[] }
  | { status: 'unavailable'; reason: 'missing' | 'permission'; message: string };

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

const NUMERIC_FIELDS = [
  'reference_value',
  'mean_value',
  'bias',
  'abs_error',
  'pct_error',
  'sd',
  'tolerance',
  'zero_offset',
  'cal_factor',
  'height_offset_cm',
] as const;

/** Hasura bisa mengirim numeric/bigint sebagai string → normalisasi ke number. */
function normalizeRow(row: CalibrationRow): CalibrationRow {
  const out = { ...row } as Record<string, unknown>;
  for (const key of NUMERIC_FIELDS) out[key] = toNumber(row[key]);
  out.readings = Array.isArray(row.readings) ? row.readings.map(toNumber).filter((v): v is number => v !== null) : null;
  return out as CalibrationRow;
}

/** Riwayat cek/kalibrasi sekolah, terbaru dulu (maks. CALIBRATION_LIMIT). */
export async function fetchCalibrations(schoolId: string, role: string): Promise<CalibrationsResult> {
  try {
    const data = await gql<{ device_calibrations: CalibrationRow[] }>(
      `query SchoolCalibrations($schoolId: uuid!, $limit: Int!) {
        device_calibrations(
          where: { school_id: { _eq: $schoolId } }
          order_by: [{ created_at: desc }]
          limit: $limit
        ) { ${CALIBRATION_FIELDS} }
      }`,
      { schoolId, limit: CALIBRATION_LIMIT },
      { role },
    );
    return { status: 'ok', rows: data.device_calibrations.map(normalizeRow) };
  } catch (error) {
    if (!(error instanceof PermissionError)) throw error;
    return {
      status: 'unavailable',
      reason: isFieldNotFound(error) ? 'missing' : 'permission',
      message: error.message,
    };
  }
}

export type CalibrationSettingsRow = {
  id: string;
  school_id: string | null;
  weight_tolerance_kg: number;
  height_tolerance_cm: number;
  updated_at: string | null;
};

export type CalibrationSettings = {
  schoolRow: CalibrationSettingsRow | null;
  globalRow: CalibrationSettingsRow | null;
  /** Batas yang dipakai app untuk sekolah ini: sekolah → global → bawaan. */
  effective: { weightKg: number; heightCm: number; source: 'school' | 'global' | 'default' };
  available: boolean;
};

export async function fetchCalibrationSettings(schoolId: string, role: string): Promise<CalibrationSettings> {
  let rows: CalibrationSettingsRow[] = [];
  let available = true;
  try {
    const data = await gql<{ calibration_settings: CalibrationSettingsRow[] }>(
      `query CalibrationSettings($schoolId: uuid!) {
        calibration_settings(where: { _or: [{ school_id: { _eq: $schoolId } }, { school_id: { _is_null: true } }] }) {
          id school_id weight_tolerance_kg height_tolerance_cm updated_at
        }
      }`,
      { schoolId },
      { role },
    );
    rows = data.calibration_settings.map(row => ({
      ...row,
      weight_tolerance_kg: toNumber(row.weight_tolerance_kg) ?? DEFAULT_WEIGHT_TOLERANCE_KG,
      height_tolerance_cm: toNumber(row.height_tolerance_cm) ?? DEFAULT_HEIGHT_TOLERANCE_CM,
    }));
  } catch (error) {
    if (!(error instanceof PermissionError)) throw error;
    available = false;
  }
  const schoolRow = rows.find(row => row.school_id === schoolId) ?? null;
  const globalRow = rows.find(row => row.school_id === null) ?? null;
  const picked = schoolRow ?? globalRow;
  return {
    schoolRow,
    globalRow,
    effective: picked
      ? { weightKg: picked.weight_tolerance_kg, heightCm: picked.height_tolerance_cm, source: schoolRow ? 'school' : 'global' }
      : { weightKg: DEFAULT_WEIGHT_TOLERANCE_KG, heightCm: DEFAULT_HEIGHT_TOLERANCE_CM, source: 'default' },
    available,
  };
}

function currentUserId(): string {
  const id = readUserIdFromToken(getAuthSession().accessToken);
  if (!id) throw new ApiError('Sesi tidak valid. Silakan masuk ulang.');
  return id;
}

export type ToleranceInput = { weightKg: number; heightCm: number };

/** Admin sekolah: simpan batas toleransi khusus sekolah (upsert baris sekolah). */
export async function saveSchoolTolerances(schoolId: string, input: ToleranceInput, role: string): Promise<void> {
  const data = await gql<{ insert_calibration_settings_one: { id: string } | null }>(
    `mutation SaveSchoolTolerances($object: calibration_settings_insert_input!) {
      insert_calibration_settings_one(
        object: $object
        on_conflict: {
          constraint: calibration_settings_school_id_key
          update_columns: [weight_tolerance_kg, height_tolerance_cm, updated_by]
        }
      ) { id }
    }`,
    {
      object: {
        school_id: schoolId,
        weight_tolerance_kg: input.weightKg,
        height_tolerance_cm: input.heightCm,
        updated_by: currentUserId(),
      },
    },
    { role },
  );
  if (!data.insert_calibration_settings_one?.id) throw new ApiError('Batas toleransi tidak dapat disimpan.');
}

/** Superadmin: ubah batas global (baris school_id NULL); dibuat bila belum ada. */
export async function saveGlobalTolerances(input: ToleranceInput, role: string): Promise<void> {
  const values = {
    weight_tolerance_kg: input.weightKg,
    height_tolerance_cm: input.heightCm,
    updated_by: currentUserId(),
  };
  const data = await gql<{ update_calibration_settings: { affected_rows: number } }>(
    `mutation SaveGlobalTolerances($set: calibration_settings_set_input!) {
      update_calibration_settings(where: { school_id: { _is_null: true } }, _set: $set) { affected_rows }
    }`,
    { set: values },
    { role },
  );
  if (data.update_calibration_settings.affected_rows > 0) return;
  await gql(
    `mutation InsertGlobalTolerances($object: calibration_settings_insert_input!) {
      insert_calibration_settings_one(object: $object) { id }
    }`,
    { object: { school_id: null, ...values } },
    { role },
  );
}

// ---------------------------------------------------------------------------
// Kolom tambahan calibration_settings: interval cek ulang + PIN "Mode teknisi".
// Query terpisah agar kartu toleransi tetap jalan di server yang belum punya kolom ini.
// ---------------------------------------------------------------------------

/** Hari setelah cek akurasi terakhir sebelum app menampilkan "minta cek ulang" (sama dengan app). */
export const DEFAULT_RECALIBRATION_INTERVAL_DAYS = 180;

export type CalibrationExtrasRow = {
  school_id: string | null;
  recalibration_interval_days: number | null;
  /** Hanya dipakai untuk tahu "sudah diatur"; hash tidak pernah ditampilkan. */
  hasPin: boolean;
};

export type CalibrationExtras = {
  available: boolean;
  schoolRow: CalibrationExtrasRow | null;
  globalRow: CalibrationExtrasRow | null;
  /** Interval yang dipakai app untuk sekolah ini: sekolah → global → bawaan. */
  intervalDays: number;
  intervalSource: 'school' | 'global' | 'default';
  /** PIN yang dipakai app: sekolah → global; null = belum diatur. */
  pinSource: 'school' | 'global' | null;
};

export async function fetchCalibrationExtras(schoolId: string, role: string): Promise<CalibrationExtras> {
  let rows: CalibrationExtrasRow[] = [];
  let available = true;
  try {
    const data = await gql<{
      calibration_settings: Array<{
        school_id: string | null;
        recalibration_interval_days: number | string | null;
        technician_pin_hash: string | null;
      }>;
    }>(
      `query CalibrationExtras($schoolId: uuid!) {
        calibration_settings(where: { _or: [{ school_id: { _eq: $schoolId } }, { school_id: { _is_null: true } }] }) {
          school_id recalibration_interval_days technician_pin_hash
        }
      }`,
      { schoolId },
      { role },
    );
    rows = data.calibration_settings.map(row => ({
      school_id: row.school_id,
      recalibration_interval_days: toNumber(row.recalibration_interval_days),
      hasPin: typeof row.technician_pin_hash === 'string' && row.technician_pin_hash.trim() !== '',
    }));
  } catch (error) {
    if (!(error instanceof PermissionError)) throw error;
    available = false;
  }
  const schoolRow = rows.find(row => row.school_id === schoolId) ?? null;
  const globalRow = rows.find(row => row.school_id === null) ?? null;
  const intervalRow = schoolRow ?? globalRow;
  const interval = intervalRow?.recalibration_interval_days ?? null;
  return {
    available,
    schoolRow,
    globalRow,
    intervalDays: interval !== null && interval > 0 ? interval : DEFAULT_RECALIBRATION_INTERVAL_DAYS,
    intervalSource: intervalRow && interval !== null ? (schoolRow ? 'school' : 'global') : 'default',
    pinSource: schoolRow?.hasPin ? 'school' : globalRow?.hasPin ? 'global' : null,
  };
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

/** hex SHA-256 dari `salt + ":" + pin` (WebCrypto), salt acak 16 byte hex. Rumus sama dengan app. */
export async function hashTechnicianPin(pin: string, salt?: string): Promise<{ hash: string; salt: string }> {
  const usedSalt = salt ?? bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${usedSalt}:${pin}`));
  return { hash: bytesToHex(new Uint8Array(digest)), salt: usedSalt };
}

export const TECHNICIAN_PIN_PATTERN = /^\d{4,8}$/;

export type SettingsTarget = { target: 'global' } | { target: 'school'; schoolId: string; base: ToleranceInput };

/**
 * Ubah sebagian kolom satu baris calibration_settings. Baris sekolah dibuat bila belum ada
 * (batas toleransi diisi `base` = nilai yang berlaku sekarang, supaya tidak berubah); pada
 * baris yang sudah ada hanya `values` (+ updated_by) yang diubah.
 */
async function patchSettingsRow(where: SettingsTarget, values: Record<string, unknown>, role: string): Promise<void> {
  const set = { ...values, updated_by: currentUserId() };
  if (where.target === 'school') {
    const data = await gql<{ insert_calibration_settings_one: { id: string } | null }>(
      `mutation PatchSchoolCalibrationSettings(
        $object: calibration_settings_insert_input!
        $columns: [calibration_settings_update_column!]!
      ) {
        insert_calibration_settings_one(
          object: $object
          on_conflict: { constraint: calibration_settings_school_id_key, update_columns: $columns }
        ) { id }
      }`,
      {
        object: {
          school_id: where.schoolId,
          weight_tolerance_kg: where.base.weightKg,
          height_tolerance_cm: where.base.heightCm,
          ...set,
        },
        columns: Object.keys(set),
      },
      { role },
    );
    if (!data.insert_calibration_settings_one?.id) throw new ApiError('Pengaturan tidak dapat disimpan.');
    return;
  }
  const data = await gql<{ update_calibration_settings: { affected_rows: number } }>(
    `mutation PatchGlobalCalibrationSettings($set: calibration_settings_set_input!) {
      update_calibration_settings(where: { school_id: { _is_null: true } }, _set: $set) { affected_rows }
    }`,
    { set },
    { role },
  );
  if (data.update_calibration_settings.affected_rows > 0) return;
  await gql(
    `mutation InsertGlobalCalibrationSettings($object: calibration_settings_insert_input!) {
      insert_calibration_settings_one(object: $object) { id }
    }`,
    { object: { school_id: null, ...set } },
    { role },
  );
}

/** Atur/ubah PIN teknisi (`pin`) atau hapus (`null`). PIN tidak pernah dikirim/disimpan polos. */
export async function saveTechnicianPin(where: SettingsTarget, pin: string | null, role: string): Promise<void> {
  if (pin !== null && !TECHNICIAN_PIN_PATTERN.test(pin)) throw new ApiError('PIN harus 4–8 angka.');
  const values =
    pin === null
      ? { technician_pin_hash: null, technician_pin_salt: null }
      : await hashTechnicianPin(pin).then(({ hash, salt }) => ({ technician_pin_hash: hash, technician_pin_salt: salt }));
  await patchSettingsRow(where, values, role);
}

/** Interval cek ulang (hari). */
export async function saveRecalibrationInterval(where: SettingsTarget, days: number, role: string): Promise<void> {
  if (!Number.isInteger(days) || days <= 0) throw new ApiError('Interval harus bilangan bulat lebih dari 0.');
  await patchSettingsRow(where, { recalibration_interval_days: days }, role);
}

export type DeviceCalibrationState = 'never' | 'out_of_tolerance' | 'stale' | 'ok';

/**
 * Status untuk staf (sama dengan app): belum pernah dicek, cek terakhir (per ukuran) di luar
 * toleransi, atau cek terakhir lebih lama dari interval. `rows` milik satu perangkat.
 */
export function deviceCalibrationState(rows: CalibrationRow[], intervalDays: number, now = Date.now()): DeviceCalibrationState {
  const checks = rows
    .filter(row => row.kind === 'check' && (row.measure === 'weight' || row.measure === 'height'))
    .map(row => ({ row, time: new Date(row.created_at).getTime() }))
    .filter(item => Number.isFinite(item.time))
    .sort((a, b) => b.time - a.time);
  if (checks.length === 0) return 'never';
  for (const measure of ['weight', 'height'] as const) {
    const latest = checks.find(item => item.row.measure === measure);
    if (latest && latest.row.within_tolerance === false) return 'out_of_tolerance';
  }
  return now - checks[0].time > intervalDays * 86_400_000 ? 'stale' : 'ok';
}

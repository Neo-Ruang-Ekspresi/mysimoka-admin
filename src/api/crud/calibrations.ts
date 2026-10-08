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

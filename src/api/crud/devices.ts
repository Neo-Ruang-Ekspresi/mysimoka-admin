/**
 * Perangkat BLE sekolah (timbangan, SmartGrowth, body composition, Xiaomi S400).
 *
 * Dua sumber data:
 *  - Registri `devices` (diisi otomatis oleh app mobile saat guru menyambungkan perangkat).
 *    Permission: school_admin select/update/delete sekolah sendiri, teacher select, super_admin select.
 *    Tetap difilter eksplisit per `school_id`.
 *  - Pemakaian dari `student_measurement_records` (capture_source = 'device_ble'), dibatasi ke sesi
 *    sekolah aktif (session_id _in) seperti halaman sesi. `device_id` = `devices.ble_id`.
 *
 * Bila tabel/relationship belum ter-deploy di Hasura ("field ... not found in type"), fungsi fetch
 * mengembalikan `null` (lihat `fetchDevices`) agar halaman tetap jalan dari data pemakaian saja.
 */
import { gql } from '../graphql';
import { ApiError, PermissionError } from '../errors';

export type DeviceKind = 'smartgrowth' | 'weight_scale' | 'body_composition' | 's400' | 'other';

export const DEVICE_KIND_LABEL: Record<DeviceKind, string> = {
  smartgrowth: 'SmartGrowth',
  weight_scale: 'Timbangan BLE',
  body_composition: 'Body composition',
  s400: 'Xiaomi S400',
  other: 'Lainnya',
};

export type DeviceRow = {
  id: string;
  school_id: string;
  device_key: string | null;
  ble_id: string | null;
  name: string | null;
  label: string | null;
  kind: DeviceKind | string | null;
  serial: string | null;
  firmware_version: string | null;
  battery_pct: number | null;
  is_active: boolean;
  first_seen_at: string | null;
  last_seen_at: string | null;
  last_seen_by: string | null;
  last_seen_user?: { id: string; email: string | null; full_name: string | null } | null;
};

const DEVICE_FIELDS =
  'id school_id device_key ble_id name label kind serial firmware_version battery_pct is_active first_seen_at last_seen_at last_seen_by';

/** Hasura belum mengenal field/tabel ini (backend belum di-deploy atau tidak terekspos untuk role). */
export function isFieldNotFound(error: unknown): boolean {
  return error instanceof Error && /field '.+' not found in type/i.test(error.message);
}

export type DevicesResult =
  | { status: 'ok'; devices: DeviceRow[] }
  /** Tabel `devices` belum ada / belum terekspos untuk role ini. */
  | { status: 'unavailable'; reason: 'missing' | 'permission'; message: string };

async function queryDevices(schoolId: string, role: string, withUser: boolean): Promise<DeviceRow[]> {
  const data = await gql<{ devices: DeviceRow[] }>(
    `query SchoolDevices($schoolId: uuid!) {
      devices(where: { school_id: { _eq: $schoolId } }, order_by: [{ last_seen_at: desc_nulls_last }]) {
        ${DEVICE_FIELDS}
        ${withUser ? 'last_seen_user { id email full_name }' : ''}
      }
    }`,
    { schoolId },
    { role },
  );
  return data.devices;
}

/**
 * Registri perangkat sekolah. Relationship `last_seen_user` bisa ditolak untuk role tertentu
 * (users tidak terekspos) → ulang tanpa relationship. Tabel tidak ada → `unavailable`.
 */
export async function fetchDevices(schoolId: string, role: string): Promise<DevicesResult> {
  try {
    return { status: 'ok', devices: await queryDevices(schoolId, role, true) };
  } catch (error) {
    if (!(error instanceof PermissionError)) throw error;
    try {
      return { status: 'ok', devices: await queryDevices(schoolId, role, false) };
    } catch (retryError) {
      if (!(retryError instanceof PermissionError)) throw retryError;
      return {
        status: 'unavailable',
        reason: isFieldNotFound(retryError) ? 'missing' : 'permission',
        message: retryError.message,
      };
    }
  }
}

export type DeviceUsageRecord = {
  device_id: string | null;
  device_name: string | null;
  measured_at: string;
  recorded_by: string | null;
  session_id: string;
};

/** Batas baris pemakaian yang diambil (terbaru dulu). */
export const DEVICE_USAGE_LIMIT = 5000;

/**
 * Pengukuran via perangkat BLE di sesi-sesi sekolah (terbaru dulu, maks. `DEVICE_USAGE_LIMIT`).
 * Bila kolom `device_id` tidak terekspos untuk role ini, ulang tanpa kolom itu (dikelompokkan per nama).
 */
export async function fetchDeviceUsage(sessionIds: string[], role: string): Promise<DeviceUsageRecord[]> {
  if (sessionIds.length === 0) return [];
  const run = async (withId: boolean) => {
    const data = await gql<{ student_measurement_records: DeviceUsageRecord[] }>(
      `query DeviceUsage($sessionIds: [uuid!]!, $limit: Int!) {
        student_measurement_records(
          where: { session_id: { _in: $sessionIds }, capture_source: { _eq: "device_ble" } }
          order_by: [{ measured_at: desc }]
          limit: $limit
        ) { ${withId ? 'device_id ' : ''}device_name measured_at recorded_by session_id }
      }`,
      { sessionIds, limit: DEVICE_USAGE_LIMIT },
      { role },
    );
    return data.student_measurement_records.map(item => ({ ...item, device_id: item.device_id ?? null }));
  };
  try {
    return await run(true);
  } catch (error) {
    if (!isFieldNotFound(error)) throw error;
    return run(false);
  }
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

/** Ubah nama panggilan perangkat (kosong = pakai nama bawaan BLE). */
export async function updateDeviceLabel(id: string, label: string | null, role: string): Promise<void> {
  const data = await gql<{ update_devices_by_pk: { id: string } | null }>(
    `mutation UpdateDeviceLabel($id: uuid!, $label: String) {
      update_devices_by_pk(pk_columns: { id: $id }, _set: { label: $label }) { id }
    }`,
    { id, label: blankToNull(label) },
    { role },
  );
  if (!data.update_devices_by_pk?.id) throw new ApiError('Perangkat tidak ditemukan atau tidak dapat diubah.');
}

/** Aktifkan/nonaktifkan perangkat. Perangkat nonaktif ditolak oleh app saat akan dipakai. */
export async function setDeviceActive(id: string, isActive: boolean, role: string): Promise<void> {
  const data = await gql<{ update_devices_by_pk: { id: string } | null }>(
    `mutation SetDeviceActive($id: uuid!, $isActive: Boolean!) {
      update_devices_by_pk(pk_columns: { id: $id }, _set: { is_active: $isActive }) { id }
    }`,
    { id, isActive },
    { role },
  );
  if (!data.update_devices_by_pk?.id) throw new ApiError('Perangkat tidak ditemukan atau tidak dapat diubah.');
}

export async function deleteDevice(id: string, role: string): Promise<void> {
  const data = await gql<{ delete_devices_by_pk: { id: string } | null }>(
    `mutation DeleteDevice($id: uuid!) { delete_devices_by_pk(id: $id) { id } }`,
    { id },
    { role },
  );
  if (!data.delete_devices_by_pk?.id) throw new ApiError('Perangkat tidak ditemukan atau tidak dapat dihapus.');
}

/**
 * CRUD sesi pengukuran/imunisasi. Buat sesi & ubah status ada di `api/school.ts` (diekspor ulang).
 * Update metadata & delete: school_admin (sekolah sendiri). Guru hanya membuat sesi.
 */
import { gql } from '../graphql';
import { ApiError, isForeignKeyError } from '../errors';
import type { SessionStatus } from '../types';

export { createImmunizationSession, createMeasurementSession, updateSessionStatus } from '../school';

export type SessionKind = 'measurement' | 'immunization';

const TABLE: Record<SessionKind, string> = {
  measurement: 'measurement_sessions',
  immunization: 'immunization_sessions',
};

export type SessionUpdateInput = {
  name: string;
  note: string | null;
  sessionDate: string;
  status: SessionStatus;
  classId: string;
  /** Hanya imunisasi. */
  vaccineName?: string;
  doseLabel?: string | null;
  officerName?: string | null;
};

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

export async function updateSession(kind: SessionKind, sessionId: string, input: SessionUpdateInput, role: string): Promise<void> {
  if (!input.name.trim()) throw new ApiError('Nama sesi wajib diisi.');
  const table = TABLE[kind];
  const set: Record<string, unknown> = {
    name: input.name.trim(),
    note: blankToNull(input.note),
    session_date: input.sessionDate,
    status: input.status,
    class_id: input.classId,
  };
  if (kind === 'immunization') {
    if (!input.vaccineName?.trim()) throw new ApiError('Jenis imunisasi wajib diisi.');
    set.vaccine_name = input.vaccineName.trim();
    set.dose_label = blankToNull(input.doseLabel);
    set.officer_name = blankToNull(input.officerName);
  }
  const data = await gql<Record<string, { id: string } | null>>(
    `mutation UpdateSession($id: uuid!, $set: ${table}_set_input!) {
      update_${table}_by_pk(pk_columns: { id: $id }, _set: $set) { id }
    }`,
    { id: sessionId, set },
    { role },
  );
  if (!data[`update_${table}_by_pk`]?.id) throw new ApiError('Sesi tidak ditemukan atau tidak dapat diubah.');
}

/** Ubah status banyak sesi (bulk). */
export async function setSessionsStatus(kind: SessionKind, ids: string[], status: SessionStatus, role: string): Promise<number> {
  if (ids.length === 0) return 0;
  const table = TABLE[kind];
  const data = await gql<Record<string, { affected_rows: number } | null>>(
    `mutation SetSessionsStatus($ids: [uuid!]!, $set: ${table}_set_input!) {
      update_${table}(where: { id: { _in: $ids } }, _set: $set) { affected_rows }
    }`,
    { ids, set: { status } },
    { role },
  );
  return data[`update_${table}`]?.affected_rows ?? 0;
}

const RECORD_TABLE: Record<SessionKind, string> = {
  measurement: 'student_measurement_records',
  immunization: 'student_immunization_records',
};

/**
 * Hapus sesi. `withRecords` → record siswa di sesi itu ikut dihapus dalam SATU request
 * (Hasura menjalankan beberapa root field mutation dalam satu transaksi: gagal → batal semua).
 */
export async function deleteSession(
  kind: SessionKind,
  sessionId: string,
  role: string,
  options: { withRecords?: boolean } = {},
): Promise<void> {
  const table = TABLE[kind];
  const records = RECORD_TABLE[kind];
  try {
    const data = await gql<Record<string, { id: string } | null>>(
      options.withRecords
        ? `mutation DeleteSessionWithRecords($id: uuid!) {
            records: delete_${records}(where: { session_id: { _eq: $id } }) { affected_rows }
            session: delete_${table}_by_pk(id: $id) { id }
          }`
        : `mutation DeleteSession($id: uuid!) { session: delete_${table}_by_pk(id: $id) { id } }`,
      { id: sessionId },
      { role },
    );
    if (!data.session?.id) throw new ApiError('Sesi tidak ditemukan atau tidak dapat dihapus.');
  } catch (error) {
    if (isForeignKeyError(error)) {
      throw new ApiError('Sesi masih memiliki data pencatatan; hapus data siswa di sesi ini terlebih dahulu.', 'fk');
    }
    throw error;
  }
}

/** Hapus banyak sesi; dijalankan satu per satu agar FK error per sesi bisa dilaporkan. */
export async function deleteSessions(
  kind: SessionKind,
  ids: string[],
  role: string,
  options: { withRecords?: boolean } = {},
): Promise<{ ok: number; failed: Array<{ id: string; error: unknown }> }> {
  let ok = 0;
  const failed: Array<{ id: string; error: unknown }> = [];
  for (const id of ids) {
    try {
      await deleteSession(kind, id, role, options);
      ok += 1;
    } catch (error) {
      failed.push({ id, error });
    }
  }
  return { ok, failed };
}

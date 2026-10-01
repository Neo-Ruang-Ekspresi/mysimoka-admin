/**
 * CRUD record pengukuran/imunisasi per siswa di sebuah sesi.
 *  - Input baru: upsert (cermin app mobile) di `api/school.ts` (diekspor ulang).
 *  - Ubah record yang sudah ada: `update_*_by_pk` (waktu ukur/pemberian tidak diubah). `recorded_by`
 *    ikut di-set ke pengubah (sama seperti upsert mobile; check permission guru mensyaratkannya).
 *  - Hapus: `delete_*_by_pk` / bulk `delete_*` (school_admin; guru tidak boleh hapus).
 */
import { gql } from '../graphql';
import { ApiError } from '../errors';
import type { ImmunizationRecordStatus } from '../types';

export { upsertImmunizationRecord, upsertMeasurementRecord } from '../school';

export type RecordKind = 'measurement' | 'immunization';

const TABLE: Record<RecordKind, string> = {
  measurement: 'student_measurement_records',
  immunization: 'student_immunization_records',
};

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

export async function updateMeasurementRecord(
  recordId: string,
  input: { heightCm: number | null; weightKg: number | null; notes: string | null; recordedBy?: string | null },
  role: string,
): Promise<void> {
  if (input.heightCm === null && input.weightKg === null) throw new ApiError('Isi minimal tinggi atau berat badan.');
  const data = await gql<{ update_student_measurement_records_by_pk: { id: string } | null }>(
    `mutation UpdateMeasurementRecord($id: uuid!, $set: student_measurement_records_set_input!) {
      update_student_measurement_records_by_pk(pk_columns: { id: $id }, _set: $set) { id }
    }`,
    {
      id: recordId,
      set: {
        height_cm: input.heightCm,
        weight_kg: input.weightKg,
        notes: blankToNull(input.notes),
        ...(input.recordedBy ? { recorded_by: input.recordedBy } : {}),
      },
    },
    { role },
  );
  if (!data.update_student_measurement_records_by_pk?.id) throw new ApiError('Data pengukuran tidak ditemukan atau tidak dapat diubah.');
}

export async function updateImmunizationRecord(
  recordId: string,
  input: {
    status: ImmunizationRecordStatus;
    vaccineName: string;
    doseLabel: string | null;
    officerName: string | null;
    batchNumber: string | null;
    injectionSite: string | null;
    notes: string | null;
    adverseEventNotes: string | null;
    recordedBy?: string | null;
  },
  role: string,
): Promise<void> {
  if (!input.vaccineName.trim()) throw new ApiError('Jenis imunisasi wajib diisi.');
  const data = await gql<{ update_student_immunization_records_by_pk: { id: string } | null }>(
    `mutation UpdateImmunizationRecord($id: uuid!, $set: student_immunization_records_set_input!) {
      update_student_immunization_records_by_pk(pk_columns: { id: $id }, _set: $set) { id }
    }`,
    {
      id: recordId,
      set: {
        status: input.status,
        vaccine_name: input.vaccineName.trim(),
        dose_label: blankToNull(input.doseLabel),
        officer_name: blankToNull(input.officerName),
        batch_number: blankToNull(input.batchNumber),
        injection_site: blankToNull(input.injectionSite),
        notes: blankToNull(input.notes),
        adverse_event_notes: blankToNull(input.adverseEventNotes),
        ...(input.recordedBy ? { recorded_by: input.recordedBy } : {}),
      },
    },
    { role },
  );
  if (!data.update_student_immunization_records_by_pk?.id) throw new ApiError('Data imunisasi tidak ditemukan atau tidak dapat diubah.');
}

export async function deleteRecord(kind: RecordKind, recordId: string, role: string): Promise<void> {
  const table = TABLE[kind];
  const data = await gql<Record<string, { id: string } | null>>(
    `mutation DeleteRecord($id: uuid!) { delete_${table}_by_pk(id: $id) { id } }`,
    { id: recordId },
    { role },
  );
  if (!data[`delete_${table}_by_pk`]?.id) throw new ApiError('Data tidak ditemukan atau tidak dapat dihapus.');
}

/** Hapus banyak record dalam satu sesi (filter eksplisit session_id). */
export async function deleteRecords(kind: RecordKind, sessionId: string, recordIds: string[], role: string): Promise<number> {
  if (recordIds.length === 0) return 0;
  const table = TABLE[kind];
  const data = await gql<Record<string, { affected_rows: number } | null>>(
    `mutation DeleteRecords($sessionId: uuid!, $ids: [uuid!]!) {
      delete_${table}(where: { session_id: { _eq: $sessionId }, id: { _in: $ids } }) { affected_rows }
    }`,
    { sessionId, ids: recordIds },
    { role },
  );
  const affected = data[`delete_${table}`]?.affected_rows ?? 0;
  if (affected < 1) throw new ApiError('Tidak ada data yang dihapus (tidak ditemukan atau tanpa akses).');
  return affected;
}

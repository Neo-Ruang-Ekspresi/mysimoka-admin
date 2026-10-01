/**
 * Query laporan/grafik. Data agregat sekolah memakai cache bersama dari hooks/useSchoolData
 * (sessions + records sudah diambil sekali per sekolah, dipakai juga oleh Ringkasan). Z-score
 * WHO butuh nilai per record + tanggal lahir, jadi agregasi dilakukan di klien (lib/growthReport.ts).
 *
 * Di sini: query terarah untuk satu siswa (halaman pertumbuhan). `_aggregate` sengaja tidak dipakai
 * untuk laporan sekolah: semua angka diturunkan dari record yang sudah ada di cache (tanpa query ekstra).
 */
import { gql } from './graphql';
import type { ImmunizationRecordRow, MeasurementRecordRow } from './types';

const MEASUREMENT_FIELDS =
  'id session_id student_id student_enrollment_id recorded_by capture_method capture_source measured_at height_cm weight_kg notes device_name created_at';
const IMMUNIZATION_FIELDS =
  'id session_id student_id student_enrollment_id recorded_by status capture_method administered_at vaccine_name dose_label officer_name batch_number injection_site notes adverse_event_notes';

/**
 * Riwayat pengukuran satu siswa, dibatasi ke sesi milik sekolah aktif (session_id _in) karena
 * permission beberapa tabel record bernilai `{}`.
 */
export async function fetchStudentMeasurements(
  studentId: string,
  sessionIds: string[],
  role: string,
): Promise<MeasurementRecordRow[]> {
  if (sessionIds.length === 0) return [];
  const data = await gql<{ student_measurement_records: MeasurementRecordRow[] }>(
    `query StudentMeasurementHistory($studentId: uuid!, $sessionIds: [uuid!]!) {
      student_measurement_records(
        where: { student_id: { _eq: $studentId }, session_id: { _in: $sessionIds } }
        order_by: [{ measured_at: asc }]
      ) { ${MEASUREMENT_FIELDS} }
    }`,
    { studentId, sessionIds },
    { role },
  );
  return data.student_measurement_records;
}

export async function fetchStudentImmunizations(
  studentId: string,
  sessionIds: string[],
  role: string,
): Promise<ImmunizationRecordRow[]> {
  if (sessionIds.length === 0) return [];
  const data = await gql<{ student_immunization_records: ImmunizationRecordRow[] }>(
    `query StudentImmunizationHistory($studentId: uuid!, $sessionIds: [uuid!]!) {
      student_immunization_records(
        where: { student_id: { _eq: $studentId }, session_id: { _in: $sessionIds } }
        order_by: [{ administered_at: desc }]
      ) { ${IMMUNIZATION_FIELDS} }
    }`,
    { studentId, sessionIds },
    { role },
  );
  return data.student_immunization_records;
}

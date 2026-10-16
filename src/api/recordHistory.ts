/**
 * Riwayat percobaan pencatatan (pengukuran & imunisasi).
 *
 * Tabel record hanya menyimpan SATU baris per (sesi, siswa) — app mobile meng-upsert, jadi
 * ukur ulang di sesi yang sama menimpa nilai lama. Backend menambah tabel riwayat
 * (`student_measurement_record_history`, `student_immunization_record_history`) yang diisi trigger
 * pada setiap insert/update; kolom `snapshot` = isi lengkap baris record saat itu.
 *   action 'backfill' = keadaan sebelum riwayat mulai dicatat ("data awal"),
 *   'insert' = pencatatan pertama, 'update' = ukur ulang / koreksi.
 *
 * Tabel belum di-deploy / role tidak diizinkan → `unavailable` (UI hanya menampilkan record saat
 * ini, tanpa toast error). Pola sama dengan api/crud/calibrations.ts.
 */
import { gql } from './graphql';
import { PermissionError } from './errors';
import { asObject, readNumber, readString } from '@/lib/object';
import type { ImmunizationRecordStatus } from './types';

export type RecordKind = 'measurement' | 'immunization';
export type HistoryAction = 'insert' | 'update' | 'backfill';

export const HISTORY_ACTION_LABEL: Record<HistoryAction, string> = {
  backfill: 'Data awal',
  insert: 'Pencatatan pertama',
  update: 'Ukur ulang / koreksi',
};

type HistoryRowRaw = {
  id: string;
  record_id: string;
  session_id: string;
  student_id: string;
  action: string;
  changed_at: string;
  snapshot: unknown;
};

/** Satu percobaan pencatatan (nilai saat itu). Field kosong bila tidak ada di snapshot. */
export type HistoryEntry = {
  id: string;
  recordId: string;
  sessionId: string;
  studentId: string;
  action: HistoryAction;
  changedAt: string;
  recordedBy: string | null;
  captureMethod: string | null;
  notes: string | null;
  // pengukuran
  measuredAt: string | null;
  heightCm: number | null;
  weightKg: number | null;
  /** Data pembanding (alat lain) bila ada di snapshot. */
  referenceHeightCm: number | null;
  referenceWeightKg: number | null;
  captureSource: string | null;
  deviceName: string | null;
  deviceId: string | null;
  // imunisasi
  administeredAt: string | null;
  status: ImmunizationRecordStatus | null;
  vaccineName: string | null;
  doseLabel: string | null;
  officerName: string | null;
  batchNumber: string | null;
  injectionSite: string | null;
  adverseEventNotes: string | null;
};

export type HistoryResult =
  | { status: 'ok'; entries: HistoryEntry[] }
  | { status: 'unavailable'; reason: 'missing' | 'permission' };

const TABLE: Record<RecordKind, string> = {
  measurement: 'student_measurement_record_history',
  immunization: 'student_immunization_record_history',
};

const HISTORY_FIELDS = 'id record_id session_id student_id action changed_at snapshot';

function normalizeAction(value: unknown): HistoryAction {
  return value === 'insert' || value === 'backfill' ? value : 'update';
}

function parseSnapshot(raw: unknown): Record<string, unknown> {
  if (typeof raw === 'string') {
    try {
      return asObject(JSON.parse(raw)) ?? {};
    } catch {
      return {};
    }
  }
  return asObject(raw) ?? {};
}

function toEntry(row: HistoryRowRaw): HistoryEntry {
  const s = parseSnapshot(row.snapshot);
  const status = readString(s.status);
  return {
    id: row.id,
    recordId: row.record_id,
    sessionId: row.session_id,
    studentId: row.student_id,
    action: normalizeAction(row.action),
    changedAt: row.changed_at,
    recordedBy: readString(s.recorded_by),
    captureMethod: readString(s.capture_method),
    notes: readString(s.notes),
    measuredAt: readString(s.measured_at),
    heightCm: readNumber(s.height_cm),
    weightKg: readNumber(s.weight_kg),
    referenceHeightCm: readNumber(s.reference_height_cm),
    referenceWeightKg: readNumber(s.reference_weight_kg),
    captureSource: readString(s.capture_source),
    deviceName: readString(s.device_name),
    deviceId: readString(s.device_id),
    administeredAt: readString(s.administered_at),
    status: (status as ImmunizationRecordStatus | null) ?? null,
    vaccineName: readString(s.vaccine_name),
    doseLabel: readString(s.dose_label),
    officerName: readString(s.officer_name),
    batchNumber: readString(s.batch_number),
    injectionSite: readString(s.injection_site),
    adverseEventNotes: readString(s.adverse_event_notes),
  };
}

async function queryHistory(
  kind: RecordKind,
  filter: { studentId: string; sessionIds: string[] } | { sessionId: string },
  role: string,
): Promise<HistoryResult> {
  const table = TABLE[kind];
  // Filter ditulis inline (bukan variabel `_bool_exp`) agar tabel yang belum ada menghasilkan
  // error "field ... not found in type" yang dikenali sebagai PermissionError.
  const query =
    'sessionId' in filter
      ? `query SessionRecordHistory($sessionId: uuid!) {
          ${table}(where: { session_id: { _eq: $sessionId } }, order_by: [{ changed_at: desc }]) { ${HISTORY_FIELDS} }
        }`
      : `query StudentRecordHistory($studentId: uuid!, $sessionIds: [uuid!]!) {
          ${table}(
            where: { student_id: { _eq: $studentId }, session_id: { _in: $sessionIds } }
            order_by: [{ changed_at: desc }]
          ) { ${HISTORY_FIELDS} }
        }`;
  try {
    const data = await gql<Record<string, HistoryRowRaw[] | undefined>>(query, filter, { role });
    return { status: 'ok', entries: (data[table] ?? []).map(toEntry) };
  } catch (error) {
    // Tabel belum di-deploy atau role belum diizinkan → riwayat tidak tersedia (bukan error).
    if (error instanceof PermissionError) {
      return { status: 'unavailable', reason: /not found in type/i.test(error.message) ? 'missing' : 'permission' };
    }
    throw error;
  }
}

/** Semua percobaan satu siswa, dibatasi ke sesi sekolah aktif (terbaru dulu). */
export function fetchStudentRecordHistory(
  kind: RecordKind,
  studentId: string,
  sessionIds: string[],
  role: string,
): Promise<HistoryResult> {
  if (sessionIds.length === 0) return Promise.resolve({ status: 'ok', entries: [] });
  return queryHistory(kind, { studentId, sessionIds }, role);
}

/** Semua percobaan di satu sesi (terbaru dulu). */
export function fetchSessionRecordHistory(kind: RecordKind, sessionId: string, role: string): Promise<HistoryResult> {
  return queryHistory(kind, { sessionId }, role);
}

/** Kunci grup percobaan: satu (sesi, siswa) = satu record resmi. */
export function attemptKey(sessionId: string, studentId: string): string {
  return `${sessionId}:${studentId}`;
}

/**
 * Kelompokkan percobaan per (sesi, siswa) — bukan per record_id, karena record yang dihapus lalu
 * dicatat ulang mendapat id baru. Urutan dalam grup: terbaru dulu.
 */
export function groupAttempts(entries: HistoryEntry[]): Map<string, HistoryEntry[]> {
  const map = new Map<string, HistoryEntry[]>();
  for (const entry of entries) {
    const key = attemptKey(entry.sessionId, entry.studentId);
    const list = map.get(key);
    if (list) list.push(entry);
    else map.set(key, [entry]);
  }
  return map;
}

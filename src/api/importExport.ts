/**
 * Impor siswa massal & ekspor data sekolah (Excel/CSV).
 *
 * Impor:
 *  - Siswa baru → batch `insert_students` dengan nested insert `enrollments` (status active).
 *    Satu batch = satu transaksi; bila batch gagal, baris di batch itu diulang satu per satu
 *    agar galat per baris bisa dilaporkan.
 *  - Siswa existing (NIS sama) → `updateStudent` + `moveEnrollment` (dari api/school.ts).
 * Ekspor: data diambil segar dari Hasura (fungsi read api/school.ts), selalu difilter per sekolah/sesi.
 */
import { gql } from './graphql';
import { errorMessage } from './errors';
import {
  fetchClasses,
  fetchEnrollments,
  fetchImmunizationRecords,
  fetchImmunizationSessions,
  fetchMeasurementRecords,
  fetchMeasurementSessions,
  moveEnrollment,
  updateStudent,
} from './school';
import type {
  ClassRow,
  ImmunizationRecordRow,
  ImmunizationSessionRow,
  MeasurementRecordRow,
  MeasurementSessionRow,
} from './types';
import { buildStudents, inPeriod, toMeasurementView, type StudentView } from '@/lib/analytics';
import { formatDate, formatDateTime } from '@/lib/format';
import { dateCell, dateTimeCell, numberCell, type CellValue, type SheetSpec } from '@/lib/excel';
import type { ParsedStudentRow } from '@/lib/studentImport';

// ---------------------------------------------------------------------------
// Impor siswa
// ---------------------------------------------------------------------------

export type ImportProgress = { done: number; total: number };
export type ImportFailure = { line: number; studentNumber: string; fullName: string; reason: string };
export type ImportSummary = { created: number; updated: number; failed: ImportFailure[]; cancelled: boolean };

const INSERT_BATCH = 25;
const UPDATE_CONCURRENCY = 4;

function blank(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed ? trimmed : null;
}

function insertObject(row: ParsedStudentRow) {
  return {
    full_name: row.fullName.trim(),
    student_number: row.studentNumber,
    gender: row.gender,
    date_of_birth: row.dateOfBirth,
    address: blank(row.address),
    parent_name: blank(row.parentName),
    parent_phone: blank(row.parentPhone),
    notes: blank(row.notes),
    is_active: true,
    enrollments: { data: [{ class_id: row.classId, status: 'active' }] },
  };
}

async function insertStudents(rows: ParsedStudentRow[], role: string): Promise<void> {
  await gql<{ insert_students: { affected_rows: number } | null }>(
    `mutation ImportStudents($objects: [students_insert_input!]!) {
      insert_students(objects: $objects) { affected_rows }
    }`,
    { objects: rows.map(insertObject) },
    { role },
  );
}

async function updateExisting(row: ParsedStudentRow, role: string): Promise<void> {
  const current = row.existing;
  if (!current) throw new Error('Siswa existing tidak ditemukan.');
  const s = current.student;
  // Sel kosong di file tidak menghapus data lama.
  await updateStudent(
    {
      studentId: current.id,
      isActive: s.is_active !== false,
      fullName: row.fullName || s.full_name,
      studentNumber: row.studentNumber,
      gender: row.gender ?? ((s.gender === 'male' || s.gender === 'female' ? s.gender : null) as 'male' | 'female' | null),
      dateOfBirth: row.dateOfBirth ?? s.date_of_birth,
      address: blank(row.address) ?? s.address,
      parentName: blank(row.parentName) ?? s.parent_name,
      parentPhone: blank(row.parentPhone) ?? s.parent_phone,
      notes: blank(row.notes) ?? s.notes,
    },
    role,
  );
  if (row.classId && row.classId !== current.classId) await moveEnrollment(current.enrollmentId, row.classId, role);
}

function failure(row: ParsedStudentRow, error: unknown): ImportFailure {
  return { line: row.line, studentNumber: row.studentNumber, fullName: row.fullName, reason: friendlyError(error) };
}

function friendlyError(error: unknown): string {
  const message = errorMessage(error);
  const lower = message.toLowerCase();
  if (lower.includes('unique') || lower.includes('duplicate') || lower.includes('uniqueness')) {
    return `NIS sudah dipakai siswa lain (mungkin di sekolah lain). Detail: ${message}`;
  }
  return message;
}

export async function importStudents(
  input: { create: ParsedStudentRow[]; update: ParsedStudentRow[] },
  role: string,
  options: { onProgress?: (progress: ImportProgress) => void; shouldCancel?: () => boolean } = {},
): Promise<ImportSummary> {
  const total = input.create.length + input.update.length;
  const summary: ImportSummary = { created: 0, updated: 0, failed: [], cancelled: false };
  let done = 0;
  const tick = (count = 1) => {
    done += count;
    options.onProgress?.({ done, total });
  };
  options.onProgress?.({ done, total });

  for (let i = 0; i < input.create.length; i += INSERT_BATCH) {
    if (options.shouldCancel?.()) {
      summary.cancelled = true;
      return summary;
    }
    const batch = input.create.slice(i, i + INSERT_BATCH);
    try {
      await insertStudents(batch, role);
      summary.created += batch.length;
      tick(batch.length);
    } catch {
      // Ulang per baris untuk menemukan baris yang bermasalah.
      for (const row of batch) {
        try {
          await insertStudents([row], role);
          summary.created += 1;
        } catch (error) {
          summary.failed.push(failure(row, error));
        }
        tick();
      }
    }
  }

  let cursor = 0;
  const worker = async () => {
    while (cursor < input.update.length) {
      if (options.shouldCancel?.()) {
        summary.cancelled = true;
        return;
      }
      const row = input.update[cursor];
      cursor += 1;
      try {
        await updateExisting(row, role);
        summary.updated += 1;
      } catch (error) {
        summary.failed.push(failure(row, error));
      }
      tick();
    }
  };
  await Promise.all(Array.from({ length: Math.min(UPDATE_CONCURRENCY, input.update.length) }, worker));
  summary.failed.sort((a, b) => a.line - b.line);
  return summary;
}

// ---------------------------------------------------------------------------
// Ekspor
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<string, string> = { draft: 'Draf', active: 'Aktif', completed: 'Selesai', cancelled: 'Dibatalkan' };
const IMM_STATUS_LABEL: Record<string, string> = { given: 'Diberikan', deferred: 'Ditunda', refused: 'Ditolak', absent: 'Tidak hadir' };
const CAPTURE_LABEL: Record<string, string> = {
  manual_form: 'Input manual',
  device_ble: 'Perangkat BLE',
  face_identification: 'Identifikasi wajah',
  batch: 'Batch',
  height_pose: 'Height pose',
  manual: 'Manual',
  automatic: 'Otomatis',
};

function genderShort(value: string | null | undefined): string {
  return value === 'male' ? 'L' : value === 'female' ? 'P' : '';
}

async function loadStudents(schoolId: string, role: string): Promise<{ students: StudentView[]; classes: ClassRow[] }> {
  const [enrollments, classes] = await Promise.all([fetchEnrollments(schoolId, role), fetchClasses(schoolId, role)]);
  return { students: buildStudents(enrollments, classes), classes };
}

export const STUDENT_EXPORT_COLUMNS = [
  { header: 'NIS', width: 16, text: true },
  { header: 'Nama lengkap', width: 30 },
  { header: 'JK', width: 5 },
  { header: 'Tanggal lahir', width: 14 },
  { header: 'Kelas', width: 12 },
  { header: 'Status', width: 10 },
  { header: 'Nama orang tua', width: 26 },
  { header: 'No. HP orang tua', width: 18, text: true },
  { header: 'Alamat', width: 36 },
];

export function studentSheet(students: StudentView[], schoolName: string, scopeLabel: string): SheetSpec {
  const sorted = [...students].sort(
    (a, b) =>
      a.className.localeCompare(b.className, 'id-ID', { numeric: true }) ||
      a.student.full_name.localeCompare(b.student.full_name, 'id-ID'),
  );
  return {
    name: 'Siswa',
    title: `Data siswa — ${schoolName}`,
    info: [
      ['Cakupan', scopeLabel],
      ['Jumlah siswa', sorted.length],
      ['Diekspor', formatDateTime(new Date().toISOString())],
    ],
    columns: STUDENT_EXPORT_COLUMNS,
    rows: sorted.map(item => [
      item.student.student_number,
      item.student.full_name,
      genderShort(item.student.gender),
      dateCell(item.student.date_of_birth),
      item.className,
      item.isActive ? 'Aktif' : 'Nonaktif',
      item.student.parent_name,
      item.student.parent_phone,
      item.student.address,
    ]),
  };
}

export async function buildAllStudentsExport(schoolId: string, schoolName: string, role: string): Promise<SheetSpec[]> {
  const { students } = await loadStudents(schoolId, role);
  return [studentSheet(students, schoolName, 'Semua siswa')];
}

export type SessionKindExport = 'measurement' | 'immunization';

type SessionContext = {
  session: MeasurementSessionRow | ImmunizationSessionRow;
  className: string;
  roster: Array<{ student: StudentView | null; studentId: string; inRoster: boolean }>;
};

function sessionRoster(
  session: MeasurementSessionRow,
  students: StudentView[],
  records: Array<{ student_id: string }>,
): SessionContext['roster'] {
  // Sama dengan halaman detail: roster = siswa aktif di kelas sesi + siswa lain yang punya record.
  const byId = new Map(students.map(item => [item.id, item]));
  const roster: SessionContext['roster'] = students
    .filter(item => item.classId === session.class_id && item.isActive)
    .map(item => ({ student: item, studentId: item.id, inRoster: true }));
  const known = new Set(roster.map(item => item.studentId));
  for (const record of records) {
    if (known.has(record.student_id)) continue;
    known.add(record.student_id);
    roster.push({ student: byId.get(record.student_id) ?? null, studentId: record.student_id, inRoster: false });
  }
  return roster.sort((a, b) => (a.student?.student.full_name ?? '').localeCompare(b.student?.student.full_name ?? '', 'id-ID'));
}

const MEASUREMENT_COLUMNS = [
  { header: 'No', width: 5 },
  { header: 'NIS', width: 16, text: true },
  { header: 'Nama', width: 30 },
  { header: 'Kelas', width: 10 },
  { header: 'JK', width: 5 },
  { header: 'Tinggi (cm)', width: 12 },
  { header: 'Berat (kg)', width: 12 },
  { header: 'IMT', width: 8 },
  { header: 'Status gizi', width: 12 },
  { header: 'Metode', width: 18 },
  { header: 'Waktu', width: 18 },
  { header: 'Catatan', width: 30 },
];

const IMMUNIZATION_COLUMNS = [
  { header: 'No', width: 5 },
  { header: 'NIS', width: 16, text: true },
  { header: 'Nama', width: 30 },
  { header: 'Kelas', width: 10 },
  { header: 'JK', width: 5 },
  { header: 'Status', width: 12 },
  { header: 'Vaksin', width: 18 },
  { header: 'Dosis', width: 10 },
  { header: 'Petugas', width: 20 },
  { header: 'No. batch', width: 14 },
  { header: 'Lokasi suntik', width: 16 },
  { header: 'Waktu', width: 18 },
  { header: 'Catatan', width: 28 },
  { header: 'KIPI', width: 28 },
];

function measurementRows(
  roster: SessionContext['roster'],
  records: MeasurementRecordRow[],
  fallbackClass: string,
): CellValue[][] {
  const byStudent = new Map(records.map(item => [item.student_id, item]));
  return roster.map((item, index) => {
    const record = byStudent.get(item.studentId) ?? null;
    const view = record ? toMeasurementView(record) : null;
    return [
      index + 1,
      item.student?.student.student_number ?? '',
      item.student?.student.full_name ?? `Siswa ${item.studentId.slice(0, 8)}`,
      item.inRoster ? fallbackClass : item.student?.className ?? '',
      genderShort(item.student?.student.gender),
      numberCell(view?.heightCm),
      numberCell(view?.weightKg),
      numberCell(view?.bmi),
      view?.category ?? (record ? '' : 'Belum diukur'),
      record ? CAPTURE_LABEL[record.capture_source] ?? record.capture_source : '',
      dateTimeCell(record?.measured_at),
      record?.notes ?? '',
    ];
  });
}

function immunizationRows(
  roster: SessionContext['roster'],
  records: ImmunizationRecordRow[],
  fallbackClass: string,
): CellValue[][] {
  const byStudent = new Map(records.map(item => [item.student_id, item]));
  return roster.map((item, index) => {
    const record = byStudent.get(item.studentId) ?? null;
    return [
      index + 1,
      item.student?.student.student_number ?? '',
      item.student?.student.full_name ?? `Siswa ${item.studentId.slice(0, 8)}`,
      item.inRoster ? fallbackClass : item.student?.className ?? '',
      genderShort(item.student?.student.gender),
      record ? IMM_STATUS_LABEL[record.status] ?? record.status : 'Belum dicatat',
      record?.vaccine_name ?? '',
      record?.dose_label ?? '',
      record?.officer_name ?? '',
      record?.batch_number ?? '',
      record?.injection_site ?? '',
      dateTimeCell(record?.administered_at),
      record?.notes ?? '',
      record?.adverse_event_notes ?? '',
    ];
  });
}

/** Ekspor detail satu sesi (per siswa) dengan blok info sesi di atas tabel. */
export async function buildSessionExport(
  input: { kind: SessionKindExport; sessionId: string; schoolId: string; schoolName: string },
  role: string,
): Promise<{ sheets: SheetSpec[]; sessionName: string }> {
  const [{ students, classes }, sessions] = await Promise.all([
    loadStudents(input.schoolId, role),
    input.kind === 'measurement'
      ? fetchMeasurementSessions(input.schoolId, role)
      : fetchImmunizationSessions(input.schoolId, role),
  ]);
  const session = (sessions as MeasurementSessionRow[]).find(item => item.id === input.sessionId);
  if (!session) throw new Error('Sesi tidak ditemukan.');
  const className = classes.find(item => item.id === session.class_id)?.name ?? '-';

  if (input.kind === 'measurement') {
    const records = await fetchMeasurementRecords([session.id], role);
    const roster = sessionRoster(session, students, records);
    const rosterTotal = roster.filter(item => item.inRoster).length;
    return {
      sessionName: session.name,
      sheets: [
        {
          name: 'Pengukuran',
          title: `Sesi pengukuran — ${session.name}`,
          info: [
            ['Sekolah', input.schoolName],
            ['Kelas', className],
            ['Tanggal sesi', dateCell(session.session_date)],
            ['Status', STATUS_LABEL[session.status] ?? session.status],
            ['Catatan sesi', session.note ?? '-'],
            ['Tercatat', `${records.length} dari ${rosterTotal} siswa`],
            ['Diekspor', formatDateTime(new Date().toISOString())],
          ],
          columns: MEASUREMENT_COLUMNS,
          rows: measurementRows(roster, records, className),
        },
      ],
    };
  }

  const imm = session as ImmunizationSessionRow;
  const records = await fetchImmunizationRecords([session.id], role);
  const roster = sessionRoster(session, students, records);
  const rosterTotal = roster.filter(item => item.inRoster).length;
  const given = records.filter(item => item.status === 'given').length;
  return {
    sessionName: session.name,
    sheets: [
      {
        name: 'Imunisasi',
        title: `Sesi imunisasi — ${session.name}`,
        info: [
          ['Sekolah', input.schoolName],
          ['Kelas', className],
          ['Tanggal sesi', dateCell(session.session_date)],
          ['Vaksin', imm.vaccine_name],
          ['Dosis', imm.dose_label ?? '-'],
          ['Petugas', imm.officer_name ?? '-'],
          ['Status', STATUS_LABEL[session.status] ?? session.status],
          ['Catatan sesi', session.note ?? '-'],
          ['Tercatat', `${records.length} dari ${rosterTotal} siswa (diberikan ${given})`],
          ['Diekspor', formatDateTime(new Date().toISOString())],
        ],
        columns: IMMUNIZATION_COLUMNS,
        rows: immunizationRows(roster, records, className),
      },
    ],
  };
}

function average(values: Array<number | null>): number | null {
  const nums = values.filter((value): value is number => typeof value === 'number');
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

/**
 * Rekap semua sesi sekolah dalam rentang tanggal (inklusif; null = tanpa batas):
 * sheet Ringkasan (1 baris/sesi), Pengukuran (semua record), Imunisasi (semua record), Siswa.
 */
export async function buildRecapExport(
  input: { schoolId: string; schoolName: string; start: string | null; end: string | null },
  role: string,
): Promise<SheetSpec[]> {
  const period = { start: input.start, end: input.end, label: '' };
  const [{ students, classes }, mSessionsAll, iSessionsAll] = await Promise.all([
    loadStudents(input.schoolId, role),
    fetchMeasurementSessions(input.schoolId, role),
    fetchImmunizationSessions(input.schoolId, role),
  ]);
  const mSessions = mSessionsAll.filter(item => inPeriod(item.session_date, period));
  const iSessions = iSessionsAll.filter(item => inPeriod(item.session_date, period));
  const [mRecords, iRecords] = await Promise.all([
    fetchMeasurementRecords(mSessions.map(item => item.id), role),
    fetchImmunizationRecords(iSessions.map(item => item.id), role),
  ]);
  const classById = new Map(classes.map(item => [item.id, item.name]));
  const studentById = new Map(students.map(item => [item.id, item]));
  const rosterSize = (classId: string) => students.filter(item => item.classId === classId && item.isActive).length;
  const rangeLabel =
    input.start || input.end
      ? `${input.start ? formatDate(input.start) : 'awal'} s.d. ${input.end ? formatDate(input.end) : 'sekarang'}`
      : 'Semua waktu';

  type SummaryRow = { date: string; cells: CellValue[] };
  const summary: SummaryRow[] = [];
  for (const session of mSessions) {
    const records = mRecords.filter(item => item.session_id === session.id).map(toMeasurementView);
    const total = rosterSize(session.class_id);
    summary.push({
      date: session.session_date,
      cells: [
        'Pengukuran',
        session.name,
        dateCell(session.session_date),
        classById.get(session.class_id) ?? '-',
        STATUS_LABEL[session.status] ?? session.status,
        '',
        total,
        records.length,
        total ? numberCell((records.length / total) * 100, 0) : null,
        numberCell(average(records.map(item => item.heightCm))),
        numberCell(average(records.map(item => item.weightKg))),
        numberCell(average(records.map(item => item.bmi))),
        '',
        session.note ?? '',
      ],
    });
  }
  for (const session of iSessions) {
    const records = iRecords.filter(item => item.session_id === session.id);
    const total = rosterSize(session.class_id);
    summary.push({
      date: session.session_date,
      cells: [
        'Imunisasi',
        session.name,
        dateCell(session.session_date),
        classById.get(session.class_id) ?? '-',
        STATUS_LABEL[session.status] ?? session.status,
        [session.vaccine_name, session.dose_label].filter(Boolean).join(' · '),
        total,
        records.length,
        total ? numberCell((records.length / total) * 100, 0) : null,
        null,
        null,
        null,
        records.filter(item => item.status === 'given').length,
        session.note ?? '',
      ],
    });
  }
  summary.sort((a, b) => b.date.localeCompare(a.date));

  const sessionById = new Map<string, MeasurementSessionRow>([...mSessions, ...iSessions].map(item => [item.id, item]));
  const studentCells = (studentId: string): CellValue[] => {
    const student = studentById.get(studentId);
    return [
      student?.student.student_number ?? '',
      student?.student.full_name ?? `Siswa ${studentId.slice(0, 8)}`,
      student?.className ?? '',
      genderShort(student?.student.gender),
    ];
  };

  const measurementDetail = [...mRecords]
    .sort((a, b) => b.measured_at.localeCompare(a.measured_at))
    .map(record => {
      const session = sessionById.get(record.session_id);
      const view = toMeasurementView(record);
      return [
        session?.name ?? '-',
        dateCell(session?.session_date),
        ...studentCells(record.student_id),
        numberCell(view.heightCm),
        numberCell(view.weightKg),
        numberCell(view.bmi),
        view.category ?? '',
        CAPTURE_LABEL[record.capture_source] ?? record.capture_source,
        dateTimeCell(record.measured_at),
        record.notes ?? '',
      ];
    });

  const immunizationDetail = [...iRecords]
    .sort((a, b) => b.administered_at.localeCompare(a.administered_at))
    .map(record => {
      const session = sessionById.get(record.session_id);
      return [
        session?.name ?? '-',
        dateCell(session?.session_date),
        ...studentCells(record.student_id),
        IMM_STATUS_LABEL[record.status] ?? record.status,
        record.vaccine_name,
        record.dose_label ?? '',
        record.officer_name ?? '',
        record.batch_number ?? '',
        record.injection_site ?? '',
        dateTimeCell(record.administered_at),
        record.notes ?? '',
        record.adverse_event_notes ?? '',
      ];
    });

  const sessionCols = [
    { header: 'Sesi', width: 26 },
    { header: 'Tanggal sesi', width: 13 },
    { header: 'NIS', width: 16, text: true },
    { header: 'Nama', width: 28 },
    { header: 'Kelas', width: 10 },
    { header: 'JK', width: 5 },
  ];

  return [
    {
      name: 'Ringkasan',
      title: `Rekap sesi — ${input.schoolName}`,
      info: [
        ['Periode', rangeLabel],
        ['Sesi pengukuran', mSessions.length],
        ['Sesi imunisasi', iSessions.length],
        ['Record pengukuran', mRecords.length],
        ['Record imunisasi', iRecords.length],
        ['Diekspor', formatDateTime(new Date().toISOString())],
      ],
      columns: [
        { header: 'Jenis', width: 12 },
        { header: 'Nama sesi', width: 28 },
        { header: 'Tanggal', width: 12 },
        { header: 'Kelas', width: 10 },
        { header: 'Status', width: 11 },
        { header: 'Vaksin / dosis', width: 20 },
        { header: 'Siswa di kelas', width: 14 },
        { header: 'Tercatat', width: 10 },
        { header: 'Cakupan (%)', width: 12 },
        { header: 'Rata-rata TB (cm)', width: 16 },
        { header: 'Rata-rata BB (kg)', width: 16 },
        { header: 'Rata-rata IMT', width: 13 },
        { header: 'Imunisasi diberikan', width: 18 },
        { header: 'Catatan', width: 28 },
      ],
      rows: summary.map(item => item.cells),
    },
    {
      name: 'Pengukuran',
      columns: [
        ...sessionCols,
        { header: 'Tinggi (cm)', width: 12 },
        { header: 'Berat (kg)', width: 12 },
        { header: 'IMT', width: 8 },
        { header: 'Status gizi', width: 12 },
        { header: 'Metode', width: 18 },
        { header: 'Waktu', width: 18 },
        { header: 'Catatan', width: 28 },
      ],
      rows: measurementDetail,
    },
    {
      name: 'Imunisasi',
      columns: [
        ...sessionCols,
        { header: 'Status', width: 12 },
        { header: 'Vaksin', width: 18 },
        { header: 'Dosis', width: 10 },
        { header: 'Petugas', width: 20 },
        { header: 'No. batch', width: 14 },
        { header: 'Lokasi suntik', width: 16 },
        { header: 'Waktu', width: 18 },
        { header: 'Catatan', width: 28 },
        { header: 'KIPI', width: 28 },
      ],
      rows: immunizationDetail,
    },
    studentSheet(students, input.schoolName, 'Semua siswa'),
  ];
}

/** Laporan galat impor (baris tidak valid + gagal simpan). */
export function importErrorSheet(failures: ImportFailure[]): SheetSpec {
  return {
    name: 'Galat impor',
    title: 'Laporan galat impor siswa',
    info: [
      ['Jumlah baris', failures.length],
      ['Dibuat', formatDateTime(new Date().toISOString())],
    ],
    columns: [
      { header: 'Baris file', width: 10 },
      { header: 'NIS', width: 16, text: true },
      { header: 'Nama', width: 30 },
      { header: 'Alasan', width: 80 },
    ],
    rows: failures.map(item => [item.line, item.studentNumber, item.fullName, item.reason]),
  };
}


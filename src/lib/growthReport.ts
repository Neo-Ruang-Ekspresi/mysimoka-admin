/**
 * Agregasi laporan gizi & imunisasi (murni, tanpa React — dipanggil dalam useMemo).
 * Semua rumus didokumentasikan di sini agar angka di UI bisa ditelusuri.
 */
import type {
  ClassRow,
  EnrollmentRow,
  ImmunizationRecordRow,
  ImmunizationRecordStatus,
  ImmunizationSessionRow,
  MeasurementRecordRow,
  MeasurementSessionRow,
  StudentRow,
} from '@/api/types';
import { buildStudents, type StudentView } from './analytics';
import { monthKey, parseDate } from './format';
import { readNumber } from './object';
import { computeBmi } from './nutrition';
import {
  ageInMonths,
  BMI_STATUSES,
  bmiForAgeZ,
  bmiStatus,
  HEIGHT_STATUSES,
  heightForAgeZ,
  heightStatus,
  normalizeSex,
  notComputedReason,
  type BmiStatus,
  type HeightStatus,
} from './growth';

export type ReportFilters = {
  /** '' = semua tahun ajaran. */
  academicYearId: string;
  /** '' = semua kelas. */
  classId: string;
  /** YYYY-MM-DD atau ''. */
  start: string;
  end: string;
  /** Jendela cakupan pengukuran (hari). */
  coverageDays: number;
};

export type GrowthPoint = {
  record: MeasurementRecordRow;
  date: string;
  ageMonths: number | null;
  heightCm: number | null;
  weightKg: number | null;
  bmi: number | null;
  bmiZ: number | null;
  hfaZ: number | null;
  bmiStatus: BmiStatus | null;
  heightStatus: HeightStatus | null;
  /** Alasan z-score tidak dihitung (null bila dihitung). */
  reason: string | null;
};

export function toGrowthPoint(record: MeasurementRecordRow, student: Pick<StudentRow, 'gender' | 'date_of_birth'>): GrowthPoint {
  const sex = normalizeSex(student.gender);
  const months = ageInMonths(student.date_of_birth, record.measured_at);
  const heightCm = readNumber(record.height_cm);
  const weightKg = readNumber(record.weight_kg);
  const bmi = computeBmi(heightCm, weightKg);
  const bmiZ = bmiForAgeZ(bmi, sex, months);
  const hfaZ = heightForAgeZ(heightCm, sex, months);
  return {
    record,
    date: record.measured_at,
    ageMonths: months,
    heightCm,
    weightKg,
    bmi,
    bmiZ,
    hfaZ,
    bmiStatus: bmiStatus(bmiZ),
    heightStatus: heightStatus(hfaZ),
    reason: notComputedReason(sex, months) ?? (bmi === null ? 'Tinggi/berat kosong' : null),
  };
}

function average(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function inRange(value: string | null | undefined, start: Date | null, end: Date | null): boolean {
  if (!start && !end) return true;
  const date = parseDate(value);
  if (!date) return false;
  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
}

export type StatusCounts<K extends string> = Record<K, number> & { notComputed: number };

function emptyCounts<K extends string>(keys: K[]): StatusCounts<K> {
  const result = { notComputed: 0 } as StatusCounts<K>;
  for (const key of keys) (result as Record<string, number>)[key] = 0;
  return result;
}

export type StudentStatusRow = {
  student: StudentView;
  latest: GrowthPoint | null;
  measuredInWindow: boolean;
};

export type ClassReportRow = {
  classId: string;
  className: string;
  students: number;
  measured: number;
  /** measuredRecent / students. */
  coverage: number | null;
  measuredRecent: number;
  avgHeight: number | null;
  avgWeight: number | null;
  avgBmiZ: number | null;
  bmi: StatusCounts<BmiStatus>;
  stunted: number;
  hfaComputed: number;
  immunized: number;
  immunizedPct: number | null;
};

export type VaccineReportRow = {
  key: string;
  vaccine: string;
  dose: string | null;
  /** Siswa (dalam cakupan) yang terdaftar di kelas yang punya sesi vaksin+dosis ini. */
  target: number;
  /** Siswa unik dengan status `given`. */
  given: number;
  coverage: number | null;
  status: Record<ImmunizationRecordStatus, number>;
  adverse: number;
};

export type MonthlyTrendRow = {
  key: string;
  measurements: number;
  students: number;
  avgBmiZ: number | null;
  avgHfaZ: number | null;
  /** Proporsi record gizi kurang+buruk / record yang dihitung. */
  thinPct: number | null;
  /** Proporsi record gizi lebih+obesitas. */
  overPct: number | null;
};

export type GrowthReport = {
  totalStudents: number;
  measuredStudents: number;
  /** Siswa dengan pengukuran terakhir yang z-score IMT/U-nya terhitung. */
  computedStudents: number;
  bmi: StatusCounts<BmiStatus>;
  height: StatusCounts<HeightStatus>;
  stuntingPrevalence: number | null;
  thinPrevalence: number | null;
  overPrevalence: number | null;
  avgBmiZ: number | null;
  avgHfaZ: number | null;
  coverage: number | null;
  measuredRecent: number;
  students: StudentStatusRow[];
  classes: ClassReportRow[];
  vaccines: VaccineReportRow[];
  immunizationStatus: Record<ImmunizationRecordStatus, number>;
  immunizedStudents: number;
  immunizationCoverage: number | null;
  adverseEvents: number;
  monthly: MonthlyTrendRow[];
};

export type ReportInput = {
  filters: ReportFilters;
  enrollments: EnrollmentRow[];
  classes: ClassRow[];
  measurementSessions: MeasurementSessionRow[];
  immunizationSessions: ImmunizationSessionRow[];
  measurementRecords: MeasurementRecordRow[];
  immunizationRecords: ImmunizationRecordRow[];
  /** Untuk jendela cakupan; default sekarang. */
  now?: Date;
};

/** Periode tahun ajaran (1 Jul start_year – 30 Jun end_year), sama dengan analytics.academicYearPeriod. */
function yearBounds(classes: ClassRow[], yearId: string): { start: Date | null; end: Date | null } {
  const year = classes.find(item => item.academic_year?.id === yearId)?.academic_year;
  return {
    start: year?.start_year ? parseDate(`${year.start_year.slice(0, 4)}-07-01`) : null,
    end: year?.end_year ? parseDate(`${year.end_year.slice(0, 4)}-06-30`) : null,
  };
}

const IMM_STATUSES: ImmunizationRecordStatus[] = ['given', 'absent', 'refused', 'deferred'];
const emptyImmStatus = (): Record<ImmunizationRecordStatus, number> => ({ given: 0, absent: 0, refused: 0, deferred: 0 });

export function computeGrowthReport(input: ReportInput): GrowthReport {
  const { filters } = input;
  const now = input.now ?? new Date();

  // --- Cakupan kelas & siswa --------------------------------------------------
  const scopedClasses = input.classes.filter(
    item =>
      (!filters.academicYearId || item.academic_year_id === filters.academicYearId) &&
      (!filters.classId || item.id === filters.classId),
  );
  const scopedClassIds = new Set(scopedClasses.map(item => item.id));
  const historical = !!filters.academicYearId;
  // Tanpa filter tahun: siswa aktif saat ini. Dengan filter tahun: semua siswa aktif yang
  // pernah terdaftar di kelas tahun itu (enrollment lama bisa berstatus selain 'active').
  const students = buildStudents(
    input.enrollments.filter(item => scopedClassIds.has(item.class_id)),
    input.classes,
  ).filter(item => item.student.is_active !== false && (historical || item.isActive));
  const studentById = new Map(students.map(item => [item.id, item]));

  // --- Rentang tanggal = tahun ajaran ∩ input tanggal --------------------------
  const yb = filters.academicYearId ? yearBounds(input.classes, filters.academicYearId) : { start: null, end: null };
  const fStart = parseDate(filters.start || null);
  const fEnd = parseDate(filters.end || null);
  const start = [yb.start, fStart].filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] ?? null;
  const endRaw = [yb.end, fEnd].filter(Boolean).sort((a, b) => a!.getTime() - b!.getTime())[0] ?? null;
  const end = endRaw ? new Date(endRaw.getTime() + 86_399_999) : null;

  // --- Pengukuran ----------------------------------------------------------------
  const validMSessions = new Set(input.measurementSessions.filter(item => item.status !== 'cancelled').map(item => item.id));
  const points: Array<{ studentId: string; point: GrowthPoint }> = [];
  for (const record of input.measurementRecords) {
    if (!validMSessions.has(record.session_id)) continue;
    const student = studentById.get(record.student_id);
    if (!student || !inRange(record.measured_at, start, end)) continue;
    points.push({ studentId: record.student_id, point: toGrowthPoint(record, student.student) });
  }

  const latestByStudent = new Map<string, GrowthPoint>();
  const recentCutoff = new Date(now.getTime() - filters.coverageDays * 86_400_000);
  const recentIds = new Set<string>();
  for (const { studentId, point } of points) {
    const current = latestByStudent.get(studentId);
    if (!current || point.date > current.date) latestByStudent.set(studentId, point);
    const date = parseDate(point.date);
    if (date && date >= recentCutoff) recentIds.add(studentId);
  }

  const bmi = emptyCounts(BMI_STATUSES);
  const height = emptyCounts(HEIGHT_STATUSES);
  const bmiZs: number[] = [];
  const hfaZs: number[] = [];
  for (const point of latestByStudent.values()) {
    if (point.bmiStatus) bmi[point.bmiStatus] += 1;
    else bmi.notComputed += 1;
    if (point.heightStatus) height[point.heightStatus] += 1;
    else height.notComputed += 1;
    if (point.bmiZ !== null) bmiZs.push(point.bmiZ);
    if (point.hfaZ !== null) hfaZs.push(point.hfaZ);
  }
  const computedBmi = latestByStudent.size - bmi.notComputed;
  const computedHfa = latestByStudent.size - height.notComputed;

  // --- Imunisasi -----------------------------------------------------------------
  const iSessions = input.immunizationSessions.filter(
    item => item.status !== 'cancelled' && scopedClassIds.has(item.class_id) && inRange(item.session_date, start, end),
  );
  const iSessionById = new Map(iSessions.map(item => [item.id, item]));
  const vaccineMap = new Map<string, { vaccine: string; dose: string | null; classIds: Set<string>; given: Set<string>; status: Record<ImmunizationRecordStatus, number>; adverse: number }>();
  const vaccineKey = (vaccine: string, dose: string | null) => `${vaccine.trim().toLowerCase()}|${(dose ?? '').trim().toLowerCase()}`;
  const ensureVaccine = (vaccine: string, dose: string | null) => {
    const key = vaccineKey(vaccine, dose);
    let entry = vaccineMap.get(key);
    if (!entry) {
      entry = { vaccine, dose, classIds: new Set(), given: new Set(), status: emptyImmStatus(), adverse: 0 };
      vaccineMap.set(key, entry);
    }
    return entry;
  };
  for (const session of iSessions) ensureVaccine(session.vaccine_name || 'Lainnya', session.dose_label).classIds.add(session.class_id);

  const immunizationStatus = emptyImmStatus();
  const immunizedIds = new Set<string>();
  const immunizedByClass = new Map<string, Set<string>>();
  let adverseEvents = 0;
  for (const record of input.immunizationRecords) {
    const session = iSessionById.get(record.session_id);
    if (!session || !studentById.has(record.student_id)) continue;
    const entry = ensureVaccine(record.vaccine_name || session.vaccine_name || 'Lainnya', record.dose_label ?? session.dose_label);
    entry.classIds.add(session.class_id);
    if (IMM_STATUSES.includes(record.status)) {
      entry.status[record.status] += 1;
      immunizationStatus[record.status] += 1;
    }
    const hasAdverse = !!record.adverse_event_notes?.trim();
    if (hasAdverse) {
      entry.adverse += 1;
      adverseEvents += 1;
    }
    if (record.status === 'given') {
      entry.given.add(record.student_id);
      immunizedIds.add(record.student_id);
      const classId = studentById.get(record.student_id)!.classId;
      const set = immunizedByClass.get(classId) ?? new Set<string>();
      set.add(record.student_id);
      immunizedByClass.set(classId, set);
    }
  }

  const studentsByClass = new Map<string, StudentView[]>();
  for (const student of students) {
    const list = studentsByClass.get(student.classId) ?? [];
    list.push(student);
    studentsByClass.set(student.classId, list);
  }

  const vaccines: VaccineReportRow[] = [...vaccineMap.entries()]
    .map(([key, entry]) => {
      const target = [...entry.classIds].reduce((sum, id) => sum + (studentsByClass.get(id)?.length ?? 0), 0);
      // Penerima bisa saja dari kelas lain (sesi gabungan) → batasi ke target bila target > 0.
      const given = target > 0 ? Math.min(entry.given.size, target) : entry.given.size;
      return {
        key,
        vaccine: entry.vaccine,
        dose: entry.dose,
        target,
        given,
        coverage: target > 0 ? given / target : null,
        status: entry.status,
        adverse: entry.adverse,
      };
    })
    .sort((a, b) => a.vaccine.localeCompare(b.vaccine, 'id-ID') || (a.dose ?? '').localeCompare(b.dose ?? '', 'id-ID', { numeric: true }));

  // --- Per kelas -------------------------------------------------------------------
  const classes: ClassReportRow[] = scopedClasses.map(classRow => {
    const list = studentsByClass.get(classRow.id) ?? [];
    const counts = emptyCounts(BMI_STATUSES);
    const heights: number[] = [];
    const weights: number[] = [];
    const zs: number[] = [];
    let measured = 0;
    let measuredRecent = 0;
    let stunted = 0;
    let hfaComputed = 0;
    for (const student of list) {
      const point = latestByStudent.get(student.id);
      if (recentIds.has(student.id)) measuredRecent += 1;
      if (!point) continue;
      measured += 1;
      if (point.bmiStatus) counts[point.bmiStatus] += 1;
      else counts.notComputed += 1;
      if (point.heightStatus) {
        hfaComputed += 1;
        if (point.heightStatus === 'pendek' || point.heightStatus === 'sangat_pendek') stunted += 1;
      }
      if (point.heightCm !== null) heights.push(point.heightCm);
      if (point.weightKg !== null) weights.push(point.weightKg);
      if (point.bmiZ !== null) zs.push(point.bmiZ);
    }
    const immunized = immunizedByClass.get(classRow.id)?.size ?? 0;
    return {
      classId: classRow.id,
      className: classRow.name,
      students: list.length,
      measured,
      measuredRecent,
      coverage: list.length > 0 ? measuredRecent / list.length : null,
      avgHeight: average(heights),
      avgWeight: average(weights),
      avgBmiZ: average(zs),
      bmi: counts,
      stunted,
      hfaComputed,
      immunized,
      immunizedPct: list.length > 0 ? immunized / list.length : null,
    };
  });

  // --- Tren bulanan ----------------------------------------------------------------
  const monthMap = new Map<string, { n: number; ids: Set<string>; bmiZ: number[]; hfaZ: number[]; thin: number; over: number }>();
  for (const { studentId, point } of points) {
    const key = monthKey(point.date);
    if (!key) continue;
    let entry = monthMap.get(key);
    if (!entry) {
      entry = { n: 0, ids: new Set(), bmiZ: [], hfaZ: [], thin: 0, over: 0 };
      monthMap.set(key, entry);
    }
    entry.n += 1;
    entry.ids.add(studentId);
    if (point.bmiZ !== null) entry.bmiZ.push(point.bmiZ);
    if (point.hfaZ !== null) entry.hfaZ.push(point.hfaZ);
    if (point.bmiStatus === 'gizi_buruk' || point.bmiStatus === 'gizi_kurang') entry.thin += 1;
    if (point.bmiStatus === 'gizi_lebih' || point.bmiStatus === 'obesitas') entry.over += 1;
  }
  const monthly = [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => ({
      key,
      measurements: entry.n,
      students: entry.ids.size,
      avgBmiZ: average(entry.bmiZ),
      avgHfaZ: average(entry.hfaZ),
      thinPct: entry.bmiZ.length > 0 ? entry.thin / entry.bmiZ.length : null,
      overPct: entry.bmiZ.length > 0 ? entry.over / entry.bmiZ.length : null,
    }));

  const studentRows: StudentStatusRow[] = students.map(student => ({
    student,
    latest: latestByStudent.get(student.id) ?? null,
    measuredInWindow: recentIds.has(student.id),
  }));

  const total = students.length;
  return {
    totalStudents: total,
    measuredStudents: latestByStudent.size,
    computedStudents: computedBmi,
    bmi,
    height,
    stuntingPrevalence: computedHfa > 0 ? (height.pendek + height.sangat_pendek) / computedHfa : null,
    thinPrevalence: computedBmi > 0 ? (bmi.gizi_buruk + bmi.gizi_kurang) / computedBmi : null,
    overPrevalence: computedBmi > 0 ? (bmi.gizi_lebih + bmi.obesitas) / computedBmi : null,
    avgBmiZ: average(bmiZs),
    avgHfaZ: average(hfaZs),
    coverage: total > 0 ? recentIds.size / total : null,
    measuredRecent: recentIds.size,
    students: studentRows,
    classes,
    vaccines,
    immunizationStatus,
    immunizedStudents: immunizedIds.size,
    immunizationCoverage: total > 0 ? immunizedIds.size / total : null,
    adverseEvents,
    monthly,
  };
}

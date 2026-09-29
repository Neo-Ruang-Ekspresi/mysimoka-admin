import type {
  ClassRow,
  EnrollmentRow,
  ImmunizationRecordRow,
  ImmunizationSessionRow,
  MeasurementRecordRow,
  MeasurementSessionRow,
  MembershipRow,
  StudentRow,
} from '@/api/types';
import { monthKey, parseDate } from './format';
import { readNumber } from './object';
import { isConnectedMembershipStatus, normalizeRoleKey } from './roles';
import { bmiCategory, computeBmi, NUTRITION_CATEGORIES, type NutritionCategory } from './nutrition';

export type Period = { start: string | null; end: string | null; label: string };

export const ALL_TIME: Period = { start: null, end: null, label: 'Semua waktu' };

export function inPeriod(value: string | null | undefined, period: Period): boolean {
  if (!period.start && !period.end) return true;
  const date = parseDate(value);
  if (!date) return false;
  const start = parseDate(period.start);
  const end = parseDate(period.end);
  if (start && date < start) return false;
  if (end && date > new Date(end.getTime() + 86_399_999)) return false;
  return true;
}

export type StudentView = {
  id: string;
  student: StudentRow;
  enrollmentId: string;
  enrollmentStatus: string | null;
  classId: string;
  className: string;
  isActive: boolean;
};

/** Satu baris per siswa; enrollment aktif diprioritaskan. */
export function buildStudents(enrollments: EnrollmentRow[], classes: ClassRow[]): StudentView[] {
  const classNameById = new Map(classes.map(item => [item.id, item.name]));
  const byStudent = new Map<string, StudentView>();
  for (const enrollment of enrollments) {
    if (!enrollment.student) continue;
    const isEnrollmentActive = !enrollment.status || enrollment.status === 'active';
    const view: StudentView = {
      id: enrollment.student.id,
      student: enrollment.student,
      enrollmentId: enrollment.id,
      enrollmentStatus: enrollment.status,
      classId: enrollment.class_id,
      className: classNameById.get(enrollment.class_id) ?? '-',
      isActive: isEnrollmentActive && enrollment.student.is_active !== false,
    };
    const existing = byStudent.get(view.id);
    if (!existing || (!existing.isActive && view.isActive)) byStudent.set(view.id, view);
  }
  return Array.from(byStudent.values()).sort((a, b) =>
    a.student.full_name.localeCompare(b.student.full_name, 'id-ID'),
  );
}

export type MeasurementView = {
  record: MeasurementRecordRow;
  heightCm: number | null;
  weightKg: number | null;
  bmi: number | null;
  category: NutritionCategory | null;
};

export function toMeasurementView(record: MeasurementRecordRow): MeasurementView {
  const heightCm = readNumber(record.height_cm);
  const weightKg = readNumber(record.weight_kg);
  const bmi = computeBmi(heightCm, weightKg);
  return { record, heightCm, weightKg, bmi, category: bmiCategory(bmi) };
}

/** Record terakhir per siswa (berdasarkan measured_at). */
export function latestMeasurementByStudent(records: MeasurementRecordRow[]): Map<string, MeasurementView> {
  const result = new Map<string, MeasurementView>();
  for (const record of records) {
    const current = result.get(record.student_id);
    if (!current || record.measured_at > current.record.measured_at) {
      result.set(record.student_id, toMeasurementView(record));
    }
  }
  return result;
}

export function teacherMemberships(memberships: MembershipRow[]): MembershipRow[] {
  return memberships.filter(
    item => normalizeRoleKey(item.role) === 'teacher' && isConnectedMembershipStatus(item.status ?? 'active'),
  );
}

function average(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export type SchoolAnalytics = {
  totalStudents: number;
  totalClasses: number;
  totalTeachers: number;
  measurementSessionCount: number;
  immunizationSessionCount: number;
  measuredStudents: number;
  measurementCoverage: number | null;
  immunizedStudents: number;
  immunizationCoverage: number | null;
  averageHeight: number | null;
  averageWeight: number | null;
  averageBmi: number | null;
  nutrition: Array<{ category: NutritionCategory; count: number }>;
  monthly: Array<{ key: string; measurements: number; avgHeight: number | null; avgWeight: number | null; immunizations: number }>;
  perClass: Array<{
    classId: string;
    className: string;
    students: number;
    measured: number;
    measuredPct: number | null;
    immunized: number;
    immunizedPct: number | null;
  }>;
  vaccines: Array<{ vaccine: string; given: number; other: number }>;
};

export function computeSchoolAnalytics(input: {
  period: Period;
  classes: ClassRow[];
  students: StudentView[];
  memberships: MembershipRow[];
  measurementSessions: MeasurementSessionRow[];
  immunizationSessions: ImmunizationSessionRow[];
  measurementRecords: MeasurementRecordRow[];
  immunizationRecords: ImmunizationRecordRow[];
}): SchoolAnalytics {
  const { period } = input;
  const activeStudents = input.students.filter(item => item.isActive);
  const activeIds = new Set(activeStudents.map(item => item.id));
  const mSessions = input.measurementSessions.filter(
    item => item.status !== 'cancelled' && inPeriod(item.session_date, period),
  );
  const iSessions = input.immunizationSessions.filter(
    item => item.status !== 'cancelled' && inPeriod(item.session_date, period),
  );
  const mSessionIds = new Set(mSessions.map(item => item.id));
  const iSessionIds = new Set(iSessions.map(item => item.id));
  const mRecords = input.measurementRecords.filter(item => mSessionIds.has(item.session_id));
  const iRecords = input.immunizationRecords.filter(item => iSessionIds.has(item.session_id));

  const latest = latestMeasurementByStudent(mRecords);
  const measuredIds = new Set([...latest.keys()].filter(id => activeIds.has(id)));
  const immunizedIds = new Set(
    iRecords.filter(item => item.status === 'given' && activeIds.has(item.student_id)).map(item => item.student_id),
  );

  const nutritionCounts = new Map<NutritionCategory, number>(NUTRITION_CATEGORIES.map(c => [c, 0]));
  const heights: number[] = [];
  const weights: number[] = [];
  const bmis: number[] = [];
  for (const [studentId, view] of latest) {
    if (!activeIds.has(studentId)) continue;
    if (view.category) nutritionCounts.set(view.category, (nutritionCounts.get(view.category) ?? 0) + 1);
    if (view.heightCm !== null) heights.push(view.heightCm);
    if (view.weightKg !== null) weights.push(view.weightKg);
    if (view.bmi !== null) bmis.push(view.bmi);
  }

  const monthlyMap = new Map<string, { measurements: number; heights: number[]; weights: number[]; immunizations: number }>();
  const bucket = (key: string) => {
    let entry = monthlyMap.get(key);
    if (!entry) {
      entry = { measurements: 0, heights: [], weights: [], immunizations: 0 };
      monthlyMap.set(key, entry);
    }
    return entry;
  };
  for (const record of mRecords) {
    const key = monthKey(record.measured_at);
    if (!key) continue;
    const entry = bucket(key);
    entry.measurements += 1;
    const height = readNumber(record.height_cm);
    const weight = readNumber(record.weight_kg);
    if (height !== null) entry.heights.push(height);
    if (weight !== null) entry.weights.push(weight);
  }
  for (const record of iRecords) {
    const key = monthKey(record.administered_at);
    if (key && record.status === 'given') bucket(key).immunizations += 1;
  }
  const monthly = [...monthlyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([key, entry]) => ({
      key,
      measurements: entry.measurements,
      avgHeight: average(entry.heights),
      avgWeight: average(entry.weights),
      immunizations: entry.immunizations,
    }));

  const perClass = input.classes.map(classRow => {
    const ids = activeStudents.filter(item => item.classId === classRow.id).map(item => item.id);
    const measured = ids.filter(id => measuredIds.has(id)).length;
    const immunized = ids.filter(id => immunizedIds.has(id)).length;
    return {
      classId: classRow.id,
      className: classRow.name,
      students: ids.length,
      measured,
      measuredPct: ids.length > 0 ? measured / ids.length : null,
      immunized,
      immunizedPct: ids.length > 0 ? immunized / ids.length : null,
    };
  });

  const vaccineMap = new Map<string, { given: number; other: number }>();
  for (const record of iRecords) {
    const name = record.vaccine_name || 'Lainnya';
    const entry = vaccineMap.get(name) ?? { given: 0, other: 0 };
    if (record.status === 'given') entry.given += 1;
    else entry.other += 1;
    vaccineMap.set(name, entry);
  }

  const total = activeStudents.length;
  return {
    totalStudents: total,
    totalClasses: input.classes.length,
    totalTeachers: teacherMemberships(input.memberships).length,
    measurementSessionCount: mSessions.length,
    immunizationSessionCount: iSessions.length,
    measuredStudents: measuredIds.size,
    measurementCoverage: total > 0 ? measuredIds.size / total : null,
    immunizedStudents: immunizedIds.size,
    immunizationCoverage: total > 0 ? immunizedIds.size / total : null,
    averageHeight: average(heights),
    averageWeight: average(weights),
    averageBmi: average(bmis),
    nutrition: NUTRITION_CATEGORIES.map(category => ({ category, count: nutritionCounts.get(category) ?? 0 })),
    monthly,
    perClass,
    vaccines: [...vaccineMap.entries()].map(([vaccine, entry]) => ({ vaccine, ...entry })),
  };
}

/** Periode tahun ajaran — sama dengan mobile: start_year-07-01 s.d. end_year-06-30. */
export function academicYearPeriod(year: { label: string | null; start_year: string | null; end_year: string | null }): Period {
  const start = year.start_year ? `${year.start_year.slice(0, 4)}-07-01` : null;
  const end = year.end_year ? `${year.end_year.slice(0, 4)}-06-30` : null;
  return { start, end, label: `TA ${year.label ?? `${year.start_year}/${year.end_year}`}` };
}

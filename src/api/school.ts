/**
 * Query & mutation untuk dashboard Admin Sekolah (dan drill-down read-only Superadmin).
 *
 * Semua query dan mutation di sini merupakan cermin dari mysimoka/src/services/auth.ts
 * (app mobile). Catatan permission Hasura (lihat metadata snapshot):
 *  - measurement_sessions / immunization_sessions / *_records: filter permission `{}` untuk
 *    school_admin → WAJIB selalu difilter eksplisit per school_id / session_id di sini.
 *  - school_memberships role `user`: filter `{}` → difilter eksplisit per user_id.
 *  - Tabel sesi & record belum punya relationship di Hasura → join dilakukan di klien.
 */
import { gql } from './graphql';
import { ApiError } from './errors';
import { registerAccount } from './auth';
import type {
  AcademicYearRow,
  ClassRow,
  EnrollmentRow,
  GradeLevelRow,
  ImmunizationRecordRow,
  ImmunizationRecordStatus,
  ImmunizationSessionRow,
  MeasurementRecordRow,
  MeasurementSessionRow,
  MembershipRow,
  SchoolRow,
  SessionStatus,
  StudentRow,
} from './types';

const SCHOOL_FIELDS = 'id name number address join_code created_by created_at updated_at';
const STUDENT_FIELDS =
  'id full_name student_number gender date_of_birth address parent_name parent_phone notes is_active created_at updated_at';
const MEASUREMENT_SESSION_FIELDS = 'id school_id class_id name note session_date status created_by created_at';
const IMMUNIZATION_SESSION_FIELDS = `${MEASUREMENT_SESSION_FIELDS} vaccine_name dose_label officer_name`;
const MEASUREMENT_RECORD_FIELDS =
  'id session_id student_id student_enrollment_id recorded_by capture_method capture_source measured_at height_cm weight_kg notes device_name created_at';
const IMMUNIZATION_RECORD_FIELDS =
  'id session_id student_id student_enrollment_id recorded_by status capture_method administered_at vaccine_name dose_label officer_name batch_number injection_site notes adverse_event_notes';

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

// ---------------------------------------------------------------------------
// Membership user yang sedang login (role `user`, seperti listMemberships mobile)
// ---------------------------------------------------------------------------

export async function fetchMyMemberships(userId: string): Promise<MembershipRow[]> {
  const data = await gql<{ school_memberships: MembershipRow[] }>(
    `query MyMemberships($userId: uuid!) {
      school_memberships(
        where: { user_id: { _eq: $userId } }
        order_by: [{ is_active: desc }, { created_at: desc }]
      ) {
        id school_id user_id role status is_active joined_at created_at
        school { id name number address join_code }
      }
    }`,
    { userId },
    { role: 'user' },
  );
  return data.school_memberships;
}

// ---------------------------------------------------------------------------
// Read (dipakai admin sekolah & superadmin, role dikirim oleh pemanggil)
// ---------------------------------------------------------------------------

export async function fetchSchool(schoolId: string, role: string): Promise<SchoolRow | null> {
  const data = await gql<{ schools_by_pk: SchoolRow | null }>(
    `query SchoolProfile($schoolId: uuid!) { schools_by_pk(id: $schoolId) { ${SCHOOL_FIELDS} } }`,
    { schoolId },
    { role },
  );
  return data.schools_by_pk;
}

export async function fetchClasses(schoolId: string, role: string): Promise<ClassRow[]> {
  const data = await gql<{ classes: ClassRow[] }>(
    `query SchoolClasses($schoolId: uuid!) {
      classes(where: { school_id: { _eq: $schoolId } }, order_by: [{ name: asc }]) {
        id name school_id academic_year_id grade_level_id created_at updated_at
        grade_level { id level_number label }
        academic_year { id label start_year end_year }
      }
    }`,
    { schoolId },
    { role },
  );
  return data.classes;
}

export async function fetchEnrollments(schoolId: string, role: string): Promise<EnrollmentRow[]> {
  const data = await gql<{ student_enrollments: EnrollmentRow[] }>(
    `query SchoolEnrollments($schoolId: uuid!) {
      student_enrollments(where: { class: { school_id: { _eq: $schoolId } } }) {
        id status class_id student_id enrolled_at created_at
        student { ${STUDENT_FIELDS} }
      }
    }`,
    { schoolId },
    { role },
  );
  return data.student_enrollments;
}

export async function fetchSchoolMemberships(schoolId: string, role: string): Promise<MembershipRow[]> {
  const data = await gql<{ school_memberships: MembershipRow[] }>(
    `query SchoolMembers($schoolId: uuid!) {
      school_memberships(where: { school_id: { _eq: $schoolId } }, order_by: [{ created_at: desc }]) {
        id school_id user_id role status is_active joined_at created_at
        user { id email full_name }
      }
    }`,
    { schoolId },
    { role },
  );
  return data.school_memberships;
}

export async function fetchMeasurementSessions(
  schoolId: string,
  role: string,
): Promise<MeasurementSessionRow[]> {
  const data = await gql<{ measurement_sessions: MeasurementSessionRow[] }>(
    `query SchoolMeasurementSessions($schoolId: uuid!) {
      measurement_sessions(
        where: { school_id: { _eq: $schoolId } }
        order_by: [{ session_date: desc }, { created_at: desc }]
      ) { ${MEASUREMENT_SESSION_FIELDS} }
    }`,
    { schoolId },
    { role },
  );
  return data.measurement_sessions;
}

export async function fetchImmunizationSessions(
  schoolId: string,
  role: string,
): Promise<ImmunizationSessionRow[]> {
  const data = await gql<{ immunization_sessions: ImmunizationSessionRow[] }>(
    `query SchoolImmunizationSessions($schoolId: uuid!) {
      immunization_sessions(
        where: { school_id: { _eq: $schoolId } }
        order_by: [{ session_date: desc }, { created_at: desc }]
      ) { ${IMMUNIZATION_SESSION_FIELDS} }
    }`,
    { schoolId },
    { role },
  );
  return data.immunization_sessions;
}

export async function fetchMeasurementRecords(
  sessionIds: string[],
  role: string,
): Promise<MeasurementRecordRow[]> {
  if (sessionIds.length === 0) return [];
  const data = await gql<{ student_measurement_records: MeasurementRecordRow[] }>(
    `query MeasurementRecords($sessionIds: [uuid!]!) {
      student_measurement_records(
        where: { session_id: { _in: $sessionIds } }
        order_by: [{ measured_at: desc }]
      ) { ${MEASUREMENT_RECORD_FIELDS} }
    }`,
    { sessionIds },
    { role },
  );
  return data.student_measurement_records;
}

export async function fetchImmunizationRecords(
  sessionIds: string[],
  role: string,
): Promise<ImmunizationRecordRow[]> {
  if (sessionIds.length === 0) return [];
  const data = await gql<{ student_immunization_records: ImmunizationRecordRow[] }>(
    `query ImmunizationRecords($sessionIds: [uuid!]!) {
      student_immunization_records(
        where: { session_id: { _in: $sessionIds } }
        order_by: [{ administered_at: desc }]
      ) { ${IMMUNIZATION_RECORD_FIELDS} }
    }`,
    { sessionIds },
    { role },
  );
  return data.student_immunization_records;
}

/** academic_years tidak memiliki school_id di skema saat ini (tabel global). */
export async function fetchAcademicYears(role: string): Promise<AcademicYearRow[]> {
  const data = await gql<{ academic_years: AcademicYearRow[] }>(
    `query AcademicYears {
      academic_years(order_by: [{ start_year: desc }, { created_at: desc }]) {
        id label start_year end_year created_at updated_at
      }
    }`,
    {},
    { role },
  );
  return data.academic_years;
}

export async function fetchGradeLevels(role: string): Promise<GradeLevelRow[]> {
  const data = await gql<{ grade_levels: GradeLevelRow[] }>(
    `query GradeLevels { grade_levels(order_by: [{ level_number: asc }]) { id level_number label } }`,
    {},
    { role },
  );
  return data.grade_levels;
}

// ---------------------------------------------------------------------------
// Mutations (cermin mutation app mobile; role admin sekolah)
// ---------------------------------------------------------------------------

export async function createClass(
  input: { schoolId: string; academicYearId: string; gradeLevelId: string; name: string },
  role: string,
): Promise<string> {
  const data = await gql<{ insert_classes_one: { id: string } | null }>(
    `mutation CreateClassroom($schoolId: uuid!, $academicYearId: uuid!, $gradeLevelId: uuid!, $name: String!) {
      insert_classes_one(object: {
        school_id: $schoolId, academic_year_id: $academicYearId, grade_level_id: $gradeLevelId, name: $name
      }) { id }
    }`,
    { ...input, name: input.name.trim() },
    { role },
  );
  if (!data.insert_classes_one?.id) throw new ApiError('Respons pembuatan kelas tidak valid.');
  return data.insert_classes_one.id;
}

export async function updateClass(
  input: { classId: string; name: string; gradeLevelId: string },
  role: string,
): Promise<void> {
  const data = await gql<{ update_classes_by_pk: { id: string } | null }>(
    `mutation UpdateClassroom($classId: uuid!, $name: String!, $gradeLevelId: uuid!) {
      update_classes_by_pk(pk_columns: { id: $classId }, _set: { name: $name, grade_level_id: $gradeLevelId }) { id }
    }`,
    { ...input, name: input.name.trim() },
    { role },
  );
  if (!data.update_classes_by_pk?.id) {
    throw new ApiError('Kelas tidak ditemukan atau tidak memiliki akses untuk mengubahnya.');
  }
}

export type StudentInput = {
  fullName: string;
  studentNumber: string;
  gender: 'male' | 'female' | null;
  dateOfBirth: string | null;
  address?: string | null;
  parentName?: string | null;
  parentPhone?: string | null;
  notes?: string | null;
};

function studentObject(input: StudentInput) {
  return {
    full_name: input.fullName.trim(),
    student_number: input.studentNumber.trim(),
    gender: input.gender,
    date_of_birth: blankToNull(input.dateOfBirth),
    address: blankToNull(input.address),
    parent_name: blankToNull(input.parentName),
    parent_phone: blankToNull(input.parentPhone),
    notes: blankToNull(input.notes),
  };
}

/** Cermin createStudent mobile: insert students lalu insert student_enrollments (status active). */
export async function createStudent(input: StudentInput & { classId: string }, role: string): Promise<string> {
  if (!input.fullName.trim()) throw new ApiError('Nama siswa wajib diisi.');
  if (!input.studentNumber.trim()) throw new ApiError('NISN wajib diisi.');
  const created = await gql<{ insert_students_one: StudentRow | null }>(
    `mutation CreateStudent($object: students_insert_input!) {
      insert_students_one(object: $object) { ${STUDENT_FIELDS} }
    }`,
    { object: { ...studentObject(input), is_active: true } },
    { role },
  );
  const studentId = created.insert_students_one?.id;
  if (!studentId) throw new ApiError('Respons simpan siswa tidak valid.');
  const enrolled = await gql<{ insert_student_enrollments_one: { id: string } | null }>(
    `mutation CreateStudentEnrollment($studentId: uuid!, $classId: uuid!) {
      insert_student_enrollments_one(object: { student_id: $studentId, class_id: $classId, status: "active" }) { id }
    }`,
    { studentId, classId: input.classId },
    { role },
  );
  if (!enrolled.insert_student_enrollments_one?.id) {
    throw new ApiError('Siswa tersimpan, tetapi gagal dimasukkan ke kelas.');
  }
  return studentId;
}

/**
 * Ubah data siswa. Mobile belum punya layar edit, namun permission `update` students untuk
 * school_admin sudah ada di metadata (kolom yang sama dengan insert).
 */
export async function updateStudent(
  input: StudentInput & { studentId: string; isActive: boolean },
  role: string,
): Promise<void> {
  const data = await gql<{ update_students_by_pk: { id: string } | null }>(
    `mutation UpdateStudent($studentId: uuid!, $set: students_set_input!) {
      update_students_by_pk(pk_columns: { id: $studentId }, _set: $set) { id }
    }`,
    { studentId: input.studentId, set: { ...studentObject(input), is_active: input.isActive } },
    { role },
  );
  if (!data.update_students_by_pk?.id) throw new ApiError('Siswa tidak ditemukan atau tidak dapat diubah.');
}

/** Pindah kelas: permission update student_enrollments (kolom class_id, status) untuk school_admin. */
export async function moveEnrollment(enrollmentId: string, classId: string, role: string): Promise<void> {
  await gql(
    `mutation MoveEnrollment($enrollmentId: uuid!, $classId: uuid!) {
      update_student_enrollments_by_pk(pk_columns: { id: $enrollmentId }, _set: { class_id: $classId }) { id }
    }`,
    { enrollmentId, classId },
    { role },
  );
}

export async function createAcademicYear(
  input: { label: string; startYear: string; endYear: string },
  role: string,
): Promise<void> {
  await gql(
    `mutation CreateAcademicYear($label: String!, $startYear: String!, $endYear: String!) {
      insert_academic_years_one(object: { label: $label, start_year: $startYear, end_year: $endYear }) { id }
    }`,
    input,
    { role },
  );
}

export async function updateAcademicYear(
  input: { id: string; label: string; startYear: string; endYear: string },
  role: string,
): Promise<void> {
  const data = await gql<{ update_academic_years: { affected_rows: number } | null }>(
    `mutation UpdateAcademicYear($id: uuid!, $label: String!, $startYear: String!, $endYear: String!) {
      update_academic_years(
        where: { id: { _eq: $id } }
        _set: { label: $label, start_year: $startYear, end_year: $endYear }
      ) { affected_rows }
    }`,
    input,
    { role },
  );
  if ((data.update_academic_years?.affected_rows ?? 0) < 1) {
    throw new ApiError('Tahun ajaran tidak ditemukan atau tidak memiliki akses untuk mengubahnya.');
  }
}

export async function deleteAcademicYear(id: string, role: string): Promise<void> {
  const data = await gql<{ delete_academic_years: { affected_rows: number } | null }>(
    `mutation DeleteAcademicYear($id: uuid!) {
      delete_academic_years(where: { id: { _eq: $id } }) { affected_rows }
    }`,
    { id },
    { role },
  );
  if ((data.delete_academic_years?.affected_rows ?? 0) < 1) {
    throw new ApiError('Tahun ajaran tidak ditemukan atau tidak memiliki akses untuk menghapusnya.');
  }
}

export async function createMeasurementSession(
  input: { schoolId: string; classId: string; name: string; note: string | null; sessionDate: string; createdBy: string },
  role: string,
): Promise<string> {
  const data = await gql<{ insert_measurement_sessions_one: { id: string } | null }>(
    `mutation CreateMeasurementSession($object: measurement_sessions_insert_input!) {
      insert_measurement_sessions_one(object: $object) { id }
    }`,
    {
      object: {
        school_id: input.schoolId,
        class_id: input.classId,
        name: input.name.trim(),
        note: blankToNull(input.note),
        session_date: input.sessionDate,
        status: 'active',
        created_by: input.createdBy,
      },
    },
    { role },
  );
  if (!data.insert_measurement_sessions_one?.id) throw new ApiError('Gagal membuat sesi pengukuran.');
  return data.insert_measurement_sessions_one.id;
}

export async function createImmunizationSession(
  input: {
    schoolId: string;
    classId: string;
    name: string;
    vaccineName: string;
    doseLabel: string | null;
    officerName: string | null;
    note: string | null;
    sessionDate: string;
    createdBy: string;
  },
  role: string,
): Promise<string> {
  const data = await gql<{ insert_immunization_sessions_one: { id: string } | null }>(
    `mutation CreateImmunizationSession($object: immunization_sessions_insert_input!) {
      insert_immunization_sessions_one(object: $object) { id }
    }`,
    {
      object: {
        school_id: input.schoolId,
        class_id: input.classId,
        name: input.name.trim(),
        vaccine_name: input.vaccineName.trim(),
        dose_label: blankToNull(input.doseLabel),
        officer_name: blankToNull(input.officerName),
        note: blankToNull(input.note),
        session_date: input.sessionDate,
        status: 'active',
        created_by: input.createdBy,
      },
    },
    { role },
  );
  if (!data.insert_immunization_sessions_one?.id) throw new ApiError('Gagal membuat sesi imunisasi.');
  return data.insert_immunization_sessions_one.id;
}

/** Update status sesi (permission update school_admin tersedia; mobile belum memakainya). */
export async function updateSessionStatus(
  kind: 'measurement' | 'immunization',
  sessionId: string,
  status: SessionStatus,
  role: string,
): Promise<void> {
  const table = kind === 'measurement' ? 'measurement_sessions' : 'immunization_sessions';
  const data = await gql<Record<string, { id: string } | null>>(
    `mutation UpdateSessionStatus($id: uuid!, $set: ${table}_set_input!) {
      update_${table}_by_pk(pk_columns: { id: $id }, _set: $set) { id }
    }`,
    { id: sessionId, set: { status } },
    { role },
  );
  if (!data[`update_${table}_by_pk`]?.id) throw new ApiError('Sesi tidak ditemukan atau tidak dapat diubah.');
}

/** Cermin saveStudentMeasurementRecord mobile (upsert per sesi+siswa, input manual). */
export async function upsertMeasurementRecord(
  input: {
    sessionId: string;
    studentId: string;
    studentEnrollmentId: string | null;
    recordedBy: string;
    heightCm: number | null;
    weightKg: number | null;
    notes: string | null;
  },
  role: string,
): Promise<void> {
  if (input.heightCm === null && input.weightKg === null) {
    throw new ApiError('Isi minimal tinggi atau berat badan.');
  }
  await gql(
    `mutation UpsertStudentMeasurementRecord($object: student_measurement_records_insert_input!) {
      insert_student_measurement_records_one(
        object: $object
        on_conflict: {
          constraint: student_measurement_records_one_per_session_student
          update_columns: [
            student_enrollment_id recorded_by capture_method capture_source measured_at
            height_cm weight_kg notes device_id device_name device_payload client_record_id
          ]
        }
      ) { id }
    }`,
    {
      object: {
        session_id: input.sessionId,
        student_id: input.studentId,
        student_enrollment_id: input.studentEnrollmentId,
        recorded_by: input.recordedBy,
        capture_method: 'manual',
        capture_source: 'manual_form',
        measured_at: new Date().toISOString(),
        height_cm: input.heightCm,
        weight_kg: input.weightKg,
        notes: blankToNull(input.notes),
        device_id: null,
        device_name: null,
        device_payload: {},
        client_record_id: null,
      },
    },
    { role },
  );
}

/** Cermin saveStudentImmunizationRecord mobile. */
export async function upsertImmunizationRecord(
  input: {
    sessionId: string;
    studentId: string;
    studentEnrollmentId: string | null;
    recordedBy: string;
    status: ImmunizationRecordStatus;
    vaccineName: string;
    doseLabel: string | null;
    officerName: string | null;
    batchNumber: string | null;
    injectionSite: string | null;
    notes: string | null;
    adverseEventNotes: string | null;
  },
  role: string,
): Promise<void> {
  if (!input.vaccineName.trim()) throw new ApiError('Jenis imunisasi wajib diisi.');
  await gql(
    `mutation UpsertStudentImmunizationRecord($object: student_immunization_records_insert_input!) {
      insert_student_immunization_records_one(
        object: $object
        on_conflict: {
          constraint: student_immunization_records_one_per_session_student
          update_columns: [
            student_enrollment_id recorded_by status capture_method administered_at vaccine_name
            dose_label officer_name batch_number injection_site notes adverse_event_notes client_record_id
          ]
        }
      ) { id }
    }`,
    {
      object: {
        session_id: input.sessionId,
        student_id: input.studentId,
        student_enrollment_id: input.studentEnrollmentId,
        recorded_by: input.recordedBy,
        status: input.status,
        capture_method: 'manual',
        administered_at: new Date().toISOString(),
        vaccine_name: input.vaccineName.trim(),
        dose_label: blankToNull(input.doseLabel),
        officer_name: blankToNull(input.officerName),
        batch_number: blankToNull(input.batchNumber),
        injection_site: blankToNull(input.injectionSite),
        notes: blankToNull(input.notes),
        adverse_event_notes: blankToNull(input.adverseEventNotes),
        client_record_id: null,
      },
    },
    { role },
  );
}

export async function updateSchoolProfile(
  input: { schoolId: string; name: string; number: string | null; address: string },
  role: string,
): Promise<void> {
  if (!input.name.trim()) throw new ApiError('Nama sekolah wajib diisi.');
  if (!input.address.trim()) throw new ApiError('Alamat sekolah wajib diisi.');
  const data = await gql<{ update_schools_by_pk: { id: string } | null }>(
    `mutation UpdateSchoolProfile($schoolId: uuid!, $name: String!, $number: String, $address: String!) {
      update_schools_by_pk(pk_columns: { id: $schoolId }, _set: { name: $name, number: $number, address: $address }) { id }
    }`,
    { schoolId: input.schoolId, name: input.name.trim(), number: blankToNull(input.number), address: input.address.trim() },
    { role },
  );
  if (!data.update_schools_by_pk?.id) throw new ApiError('Respons update profil sekolah tidak valid.');
}

function buildJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const random = new Uint32Array(8);
  crypto.getRandomValues(random);
  return Array.from(random, value => chars[value % chars.length]).join('');
}

/** Cermin regenerateSchoolJoinCode mobile (8 karakter, retry bila bentrok unique). */
export async function regenerateJoinCode(schoolId: string, role: string): Promise<string> {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const joinCode = buildJoinCode();
    try {
      const data = await gql<{ update_schools_by_pk: { join_code: string | null } | null }>(
        `mutation RegenerateSchoolJoinCode($schoolId: uuid!, $joinCode: String!) {
          update_schools_by_pk(pk_columns: { id: $schoolId }, _set: { join_code: $joinCode }) { join_code }
        }`,
        { schoolId, joinCode },
        { role },
      );
      return data.update_schools_by_pk?.join_code ?? joinCode;
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      const conflict = message.includes('unique') || message.includes('duplicate') || message.includes('constraint');
      if (!conflict || attempt === 5) throw error;
    }
  }
  throw new ApiError('Gagal membuat kode gabung baru.');
}

// ---------------------------------------------------------------------------
// Tambah guru — cermin createTeacherForSchool mobile
// ---------------------------------------------------------------------------

async function findUserByEmail(email: string, role: string) {
  const data = await gql<{ auth_users: Array<{ id: string; email: string; full_name: string | null }> }>(
    `query FindUserByEmail($email: String!) {
      auth_users(where: { email: { _eq: $email } }, limit: 1) { id email full_name }
    }`,
    { email },
    { role },
  );
  return data.auth_users[0] ?? null;
}

async function findRoleIdByCode(codes: string[], role: string): Promise<string | null> {
  const data = await gql<{ auth_roles: Array<{ id: string; code: string }> }>(
    `query FindAuthRole($codes: [String!]!) { auth_roles(where: { code: { _in: $codes } }) { id code } }`,
    { codes },
    { role },
  );
  for (const code of codes) {
    const found = data.auth_roles.find(item => item.code === code);
    if (found) return found.id;
  }
  return null;
}

/**
 * Set default role auth.user_roles → teacher/school_member. Berbeda dengan mobile, role default
 * yang SUDAH ada tidak ditimpa (agar admin/superadmin yang diundang sebagai guru tidak turun role).
 */
async function ensureDefaultAuthRole(userId: string, roleId: string, role: string): Promise<void> {
  const data = await gql<{ auth_user_roles: Array<{ role_id: string }> }>(
    `query FindDefaultUserRole($userId: uuid!) {
      auth_user_roles(where: { user_id: { _eq: $userId }, is_default: { _eq: true } }, limit: 1) { role_id }
    }`,
    { userId },
    { role },
  );
  if (data.auth_user_roles.length > 0) return;
  await gql(
    `mutation InsertDefaultUserRole($userId: uuid!, $roleId: uuid!) {
      insert_auth_user_roles_one(object: { user_id: $userId, role_id: $roleId, is_default: true }) { user_id }
    }`,
    { userId, roleId },
    { role },
  );
}

export async function addTeacher(
  input: { schoolId: string; email: string; fullName: string; password: string },
  role: string,
): Promise<void> {
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  if (!email || !fullName) throw new ApiError('Nama dan email guru wajib diisi.');

  let user = await findUserByEmail(email, role);
  if (!user) {
    if (input.password.length < 6) throw new ApiError('Password minimal 6 karakter untuk akun baru.');
    await registerAccount({ email, password: input.password, full_name: fullName });
    user = await findUserByEmail(email, role);
  }
  if (!user) throw new ApiError('User guru berhasil dibuat, tetapi belum bisa ditemukan.');

  const teacherRoleId = await findRoleIdByCode(['teacher', 'school_member'], role);
  if (!teacherRoleId) throw new ApiError('Role school_member/teacher belum tersedia di tabel auth.roles.');
  await ensureDefaultAuthRole(user.id, teacherRoleId, role);

  const existing = await gql<{ school_memberships: Array<{ id: string }> }>(
    `query FindTeacherMembership($userId: uuid!, $schoolId: uuid!) {
      school_memberships(where: { user_id: { _eq: $userId }, school_id: { _eq: $schoolId } }, limit: 1) { id }
    }`,
    { userId: user.id, schoolId: input.schoolId },
    { role },
  );
  const membershipId = existing.school_memberships[0]?.id;
  if (membershipId) {
    await gql(
      `mutation UpdateTeacherMembership($membershipId: uuid!) {
        update_school_memberships_by_pk(
          pk_columns: { id: $membershipId }
          _set: { role: "teacher", status: "active", is_active: true }
        ) { id }
      }`,
      { membershipId },
      { role },
    );
  } else {
    await gql(
      `mutation InsertTeacherMembership($userId: uuid!, $schoolId: uuid!) {
        insert_school_memberships_one(object: {
          user_id: $userId, school_id: $schoolId, role: "teacher", status: "active", is_active: true
        }) { id }
      }`,
      { userId: user.id, schoolId: input.schoolId },
      { role },
    );
  }
}

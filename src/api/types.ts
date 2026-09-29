// Tipe baris Hasura. Nama kolom diverifikasi terhadap
// mysimoka/docs/hasura_metadata_2026_06_23_20_02_51_377.json dan *_schema.sql.

export type SessionStatus = 'draft' | 'active' | 'completed' | 'cancelled';
export type ImmunizationRecordStatus = 'given' | 'deferred' | 'refused' | 'absent';
export type MeasurementCaptureMethod = 'manual' | 'automatic';
export type MeasurementCaptureSource =
  | 'manual_form'
  | 'device_ble'
  | 'face_identification'
  | 'batch'
  | 'height_pose';

export type SchoolRow = {
  id: string;
  name: string | null;
  number: string | null;
  address: string | null;
  join_code: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type UserLite = {
  id: string;
  email: string | null;
  full_name: string | null;
};

export type MembershipRow = {
  id: string;
  school_id: string;
  user_id: string;
  role: string;
  status: string | null;
  is_active: boolean | null;
  joined_at: string | null;
  created_at: string | null;
  user?: UserLite | null;
  school?: Pick<SchoolRow, 'id' | 'name' | 'number' | 'address' | 'join_code'> | null;
};

export type GradeLevelRow = {
  id: string;
  level_number: number | null;
  label: string | null;
};

export type AcademicYearRow = {
  id: string;
  label: string | null;
  start_year: string | null;
  end_year: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type ClassRow = {
  id: string;
  name: string;
  school_id: string;
  academic_year_id: string | null;
  grade_level_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  grade_level?: GradeLevelRow | null;
  academic_year?: Pick<AcademicYearRow, 'id' | 'label' | 'start_year' | 'end_year'> | null;
};

export type StudentRow = {
  id: string;
  full_name: string;
  student_number: string | null;
  gender: string | null;
  date_of_birth: string | null;
  address: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  notes: string | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

export type EnrollmentRow = {
  id: string;
  status: string | null;
  class_id: string;
  student_id: string;
  enrolled_at: string | null;
  created_at: string | null;
  student: StudentRow | null;
};

export type MeasurementSessionRow = {
  id: string;
  school_id: string;
  class_id: string;
  name: string;
  note: string | null;
  session_date: string;
  status: SessionStatus;
  created_by: string | null;
  created_at: string | null;
};

export type ImmunizationSessionRow = MeasurementSessionRow & {
  vaccine_name: string;
  dose_label: string | null;
  officer_name: string | null;
};

export type MeasurementRecordRow = {
  id: string;
  session_id: string;
  student_id: string;
  student_enrollment_id: string | null;
  recorded_by: string | null;
  capture_method: MeasurementCaptureMethod;
  capture_source: MeasurementCaptureSource;
  measured_at: string;
  height_cm: number | string | null;
  weight_kg: number | string | null;
  notes: string | null;
  device_name: string | null;
  created_at: string | null;
};

export type ImmunizationRecordRow = {
  id: string;
  session_id: string;
  student_id: string;
  student_enrollment_id: string | null;
  recorded_by: string | null;
  status: ImmunizationRecordStatus;
  capture_method: string | null;
  administered_at: string;
  vaccine_name: string;
  dose_label: string | null;
  officer_name: string | null;
  batch_number: string | null;
  injection_site: string | null;
  notes: string | null;
  adverse_event_notes: string | null;
};

export type AuthUserRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  is_email_verified: boolean | null;
  is_blocked: boolean | null;
  created_at: string | null;
  school_memberships: Array<
    Pick<MembershipRow, 'id' | 'role' | 'status' | 'is_active' | 'school_id'> & {
      school: { id: string; name: string | null } | null;
    }
  >;
  user_roles: Array<{ is_default: boolean | null; role: { code: string | null; name: string | null } | null }>;
};

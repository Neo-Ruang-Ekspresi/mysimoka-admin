/**
 * Query untuk dashboard Superadmin (role Hasura `super_admin`).
 * Role ini BELUM ada di backend — lihat docs/superadmin_backend.md untuk permission yang
 * dibutuhkan. Semua query read-only. Error permission dilempar sebagai PermissionError.
 */
import { gql } from './graphql';
import type { AuthUserRow, SchoolRow } from './types';

type Count = { aggregate: { count: number } | null };

export type GlobalStats = {
  schools: number;
  classes: number;
  students: number;
  activeStudents: number;
  users: number;
  measurementSessions: number;
  immunizationSessions: number;
  measurementRecords: number;
  immunizationRecords: number;
  immunizationGiven: number;
};

export async function fetchGlobalStats(role: string): Promise<GlobalStats> {
  const data = await gql<Record<string, Count>>(
    `query GlobalStats {
      schools: schools_aggregate { aggregate { count } }
      classes: classes_aggregate { aggregate { count } }
      students: students_aggregate { aggregate { count } }
      activeStudents: students_aggregate(where: { is_active: { _eq: true } }) { aggregate { count } }
      users: auth_users_aggregate { aggregate { count } }
      measurementSessions: measurement_sessions_aggregate { aggregate { count } }
      immunizationSessions: immunization_sessions_aggregate { aggregate { count } }
      measurementRecords: student_measurement_records_aggregate { aggregate { count } }
      immunizationRecords: student_immunization_records_aggregate { aggregate { count } }
      immunizationGiven: student_immunization_records_aggregate(where: { status: { _eq: "given" } }) { aggregate { count } }
    }`,
    {},
    { role },
  );
  const read = (key: string) => data[key]?.aggregate?.count ?? 0;
  return {
    schools: read('schools'),
    classes: read('classes'),
    students: read('students'),
    activeStudents: read('activeStudents'),
    users: read('users'),
    measurementSessions: read('measurementSessions'),
    immunizationSessions: read('immunizationSessions'),
    measurementRecords: read('measurementRecords'),
    immunizationRecords: read('immunizationRecords'),
    immunizationGiven: read('immunizationGiven'),
  };
}

export type RecentMeasurement = {
  measured_at: string;
  height_cm: number | string | null;
  weight_kg: number | string | null;
  student_id: string;
  session_id: string;
};

/** Record pengukuran sejak tanggal tertentu (untuk tren bulanan global). */
export async function fetchRecentMeasurements(sinceIso: string, role: string): Promise<RecentMeasurement[]> {
  const data = await gql<{ student_measurement_records: RecentMeasurement[] }>(
    `query RecentMeasurements($since: timestamptz!) {
      student_measurement_records(where: { measured_at: { _gte: $since } }) {
        measured_at height_cm weight_kg student_id session_id
      }
    }`,
    { since: sinceIso },
    { role },
  );
  return data.student_measurement_records;
}

export type SchoolOverviewRow = SchoolRow & {
  user: { id: string; email: string | null; full_name: string | null } | null;
  classes: Array<{ id: string; student_enrollments_aggregate: Count }>;
  school_memberships: Array<{ id: string; role: string; status: string | null }>;
};

export type SchoolsOverview = {
  schools: SchoolOverviewRow[];
  measurementSessions: Array<{ id: string; school_id: string; status: string; session_date: string }>;
  immunizationSessions: Array<{ id: string; school_id: string; status: string; session_date: string }>;
};

export async function fetchSchoolsOverview(role: string): Promise<SchoolsOverview> {
  return gql<SchoolsOverview>(
    `query SchoolsOverview {
      schools(order_by: [{ created_at: desc }]) {
        id name number address join_code created_by created_at updated_at
        user { id email full_name }
        classes { id student_enrollments_aggregate(where: { status: { _eq: "active" } }) { aggregate { count } } }
        school_memberships { id role status }
      }
      measurementSessions: measurement_sessions { id school_id status session_date }
      immunizationSessions: immunization_sessions { id school_id status session_date }
    }`,
    {},
    { role },
  );
}

export async function fetchUsers(role: string): Promise<AuthUserRow[]> {
  const data = await gql<{ auth_users: AuthUserRow[] }>(
    `query Users {
      auth_users(order_by: [{ created_at: desc }]) {
        id email full_name is_email_verified is_blocked created_at
        school_memberships { id role status is_active school_id school { id name } }
        user_roles { is_default role { code name } }
      }
    }`,
    {},
    { role },
  );
  return data.auth_users;
}

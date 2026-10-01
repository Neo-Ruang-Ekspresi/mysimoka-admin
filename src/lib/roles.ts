// Konvensi role mengikuti app mobile (normalizeRoleKey di mysimoka/src/services/auth.ts)
// ditambah role baru `super_admin` khusus dashboard ini.
export const SUPER_ADMIN_ROLE = 'super_admin';
export const SCHOOL_ADMIN_ROLE = 'school_admin';
export const TEACHER_ROLE = 'teacher';

export type AppRole = 'super_admin' | 'school_admin' | 'teacher' | 'user' | string;

export function normalizeRoleKey(value: string): AppRole {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'admin' || normalized === 'admin_sekolah') return 'school_admin';
  if (normalized === 'school_member' || normalized === 'anggota_sekolah') return 'teacher';
  if (normalized === 'superadmin' || normalized === 'super-admin') return 'super_admin';
  return normalized;
}

const ROLE_PRIORITY = ['super_admin', 'school_admin', 'teacher', 'user'];

export function sortRolesByPriority(roles: string[]): string[] {
  const unique = Array.from(new Set(roles.map(normalizeRoleKey)));
  return unique.sort((a, b) => {
    const pa = ROLE_PRIORITY.indexOf(a);
    const pb = ROLE_PRIORITY.indexOf(b);
    return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
  });
}

/**
 * Header `x-hasura-role` untuk dashboard sekolah. App mobile mengirim role yang sudah
 * dinormalisasi (`school_admin`). Bila JWT hanya memuat alias lama `admin_sekolah`,
 * kirim alias itu agar tidak ditolak "role is not in allowed roles".
 */
export function resolveSchoolAdminHasuraRole(rawAllowedRoles: string[]): string {
  if (rawAllowedRoles.length === 0 || rawAllowedRoles.includes('school_admin')) return 'school_admin';
  if (rawAllowedRoles.includes('admin_sekolah')) return 'admin_sekolah';
  return 'school_admin';
}

/**
 * Header `x-hasura-role` untuk mode guru. Default `teacher`; bila JWT hanya memuat alias
 * lama (`school_member`/`anggota_sekolah`), kirim alias itu.
 */
export function resolveTeacherHasuraRole(rawAllowedRoles: string[]): string {
  if (rawAllowedRoles.length === 0 || rawAllowedRoles.includes(TEACHER_ROLE)) return TEACHER_ROLE;
  return rawAllowedRoles.find(role => normalizeRoleKey(role) === TEACHER_ROLE) ?? TEACHER_ROLE;
}

export function resolveSuperAdminHasuraRole(rawAllowedRoles: string[]): string {
  return rawAllowedRoles.find(role => normalizeRoleKey(role) === SUPER_ADMIN_ROLE) ?? SUPER_ADMIN_ROLE;
}

export const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Superadmin',
  school_admin: 'Admin Sekolah',
  teacher: 'Guru',
  user: 'Pengguna',
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[normalizeRoleKey(role)] ?? role;
}

export function isConnectedMembershipStatus(status: string | null | undefined): boolean {
  const value = (status ?? '').trim().toLowerCase();
  return value === 'active' || value === 'approved' || value === 'accepted';
}

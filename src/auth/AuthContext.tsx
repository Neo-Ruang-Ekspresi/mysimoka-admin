import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { login as loginRequest, logout as logoutRequest } from '@/api/auth';
import { getAuthSession, subscribeAuthSession, type AuthSession } from '@/api/session';
import { fetchMyMemberships } from '@/api/school';
import type { MembershipRow } from '@/api/types';
import { SUPERADMIN_PREVIEW } from '@/config/env';
import { readAllowedRolesRaw, readUserIdFromToken } from '@/lib/jwt';
import { isUuid, readString } from '@/lib/object';
import {
  isConnectedMembershipStatus,
  normalizeRoleKey,
  resolveSchoolAdminHasuraRole,
  resolveSuperAdminHasuraRole,
  resolveTeacherHasuraRole,
  sortRolesByPriority,
} from '@/lib/roles';

const CURRENT_SCHOOL_KEY = 'mysimoka-admin:current-school';

export type AdminSchool = {
  schoolId: string;
  name: string;
  number: string | null;
  address: string | null;
  membershipId: string;
  isActive: boolean;
};

/** Sekolah tempat user menjadi guru (bentuk sama dengan AdminSchool). */
export type TeacherSchool = AdminSchool;

type AuthContextValue = {
  isAuthenticated: boolean;
  userId: string | null;
  displayName: string;
  email: string | null;
  roles: string[];
  rawRoles: string[];
  hasSuperAdminRole: boolean;
  canSuperAdmin: boolean;
  canSchoolAdmin: boolean;
  /** User punya membership guru aktif → boleh mode guru (`/pengajar`). */
  canTeacher: boolean;
  schoolAdminRole: string;
  /** Header x-hasura-role untuk mode guru (`teacher`). */
  teacherRole: string;
  superAdminRole: string;
  memberships: MembershipRow[];
  membershipsLoading: boolean;
  membershipsError: unknown;
  adminSchools: AdminSchool[];
  currentSchool: AdminSchool | null;
  teacherSchools: TeacherSchool[];
  currentTeacherSchool: TeacherSchool | null;
  setCurrentSchoolId: (schoolId: string) => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredSchoolId(): string | null {
  try {
    return localStorage.getItem(CURRENT_SCHOOL_KEY);
  } catch {
    return null;
  }
}

function schoolsForRole(memberships: MembershipRow[], role: 'school_admin' | 'teacher'): AdminSchool[] {
  const seen = new Map<string, AdminSchool>();
  for (const item of memberships) {
    if (normalizeRoleKey(item.role) !== role) continue;
    if (!item.is_active && !isConnectedMembershipStatus(item.status)) continue;
    if (seen.has(item.school_id)) continue;
    seen.set(item.school_id, {
      schoolId: item.school_id,
      name: item.school?.name ?? `Sekolah ${item.school_id.slice(0, 8).toUpperCase()}`,
      number: item.school?.number ?? null,
      address: item.school?.address ?? null,
      membershipId: item.id,
      isActive: item.is_active === true,
    });
  }
  return [...seen.values()].sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<AuthSession>(getAuthSession());
  const [storedSchoolId, setStoredSchoolId] = useState<string | null>(readStoredSchoolId());

  useEffect(() => subscribeAuthSession(setSession), []);

  const isAuthenticated = Boolean(session.accessToken || session.refreshToken);
  const rawRoles = useMemo(() => readAllowedRolesRaw(session.accessToken), [session.accessToken]);
  const roles = useMemo(() => {
    const fromUser = session.user?.allowed_roles;
    const fallback = Array.isArray(fromUser) ? fromUser.filter((r): r is string => typeof r === 'string') : [];
    return sortRolesByPriority(rawRoles.length > 0 ? rawRoles : fallback);
  }, [rawRoles, session.user]);

  const userId = useMemo(() => {
    const fromToken = readUserIdFromToken(session.accessToken);
    if (fromToken && isUuid(fromToken)) return fromToken;
    const fromUser = readString(session.user?.id) ?? readString(session.user?.user_id);
    return fromUser && isUuid(fromUser) ? fromUser : null;
  }, [session.accessToken, session.user]);

  const membershipsQuery = useQuery({
    queryKey: ['my-memberships', userId],
    queryFn: () => fetchMyMemberships(userId!),
    enabled: isAuthenticated && Boolean(userId),
    staleTime: 5 * 60_000,
  });

  const memberships = membershipsQuery.data ?? [];
  const adminSchools = useMemo(() => schoolsForRole(memberships, 'school_admin'), [memberships]);
  const teacherSchools = useMemo(() => schoolsForRole(memberships, 'teacher'), [memberships]);

  const currentSchool =
    adminSchools.find(item => item.schoolId === storedSchoolId) ?? adminSchools[0] ?? null;
  const currentTeacherSchool =
    teacherSchools.find(item => item.schoolId === storedSchoolId) ?? teacherSchools[0] ?? null;

  const setCurrentSchoolId = useCallback((schoolId: string) => {
    setStoredSchoolId(schoolId);
    try {
      localStorage.setItem(CURRENT_SCHOOL_KEY, schoolId);
    } catch {
      // abaikan
    }
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      queryClient.clear();
      await loginRequest(email, password);
    },
    [queryClient],
  );

  const logout = useCallback(() => {
    logoutRequest();
    queryClient.clear();
  }, [queryClient]);

  const hasSuperAdminRole = roles.includes('super_admin');
  const displayName =
    readString(session.user?.full_name) ?? readString(session.user?.name) ?? readString(session.user?.email) ?? 'Pengguna';

  const value: AuthContextValue = {
    isAuthenticated,
    userId,
    displayName,
    email: readString(session.user?.email),
    roles,
    rawRoles,
    hasSuperAdminRole,
    canSuperAdmin: hasSuperAdminRole || SUPERADMIN_PREVIEW,
    canSchoolAdmin: adminSchools.length > 0 || roles.includes('school_admin'),
    canTeacher: teacherSchools.length > 0,
    schoolAdminRole: resolveSchoolAdminHasuraRole(rawRoles),
    teacherRole: resolveTeacherHasuraRole(rawRoles),
    superAdminRole: resolveSuperAdminHasuraRole(rawRoles),
    memberships,
    membershipsLoading: membershipsQuery.isLoading,
    membershipsError: membershipsQuery.error,
    adminSchools,
    currentSchool,
    teacherSchools,
    currentTeacherSchool,
    setCurrentSchoolId,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth harus dipakai di dalam AuthProvider');
  return context;
}

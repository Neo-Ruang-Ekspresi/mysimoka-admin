import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { fetchGlobalStats, fetchRecentMeasurements, fetchSchoolsOverview, fetchUsers } from '@/api/superadmin';
import { PermissionError } from '@/api/errors';

// PermissionError tidak di-retry: izin backend belum ada, retry tidak membantu.
const retry = (count: number, error: unknown) => !(error instanceof PermissionError) && count < 2;

export function useGlobalStats() {
  const { superAdminRole } = useAuth();
  return useQuery({ queryKey: ['super', superAdminRole, 'stats'], queryFn: () => fetchGlobalStats(superAdminRole), retry });
}

export function useSchoolsOverview() {
  const { superAdminRole } = useAuth();
  return useQuery({ queryKey: ['super', superAdminRole, 'schools'], queryFn: () => fetchSchoolsOverview(superAdminRole), retry });
}

export function useRecentMeasurements(sinceIso: string) {
  const { superAdminRole } = useAuth();
  return useQuery({
    queryKey: ['super', superAdminRole, 'recent-measurements', sinceIso],
    queryFn: () => fetchRecentMeasurements(sinceIso, superAdminRole),
    retry,
  });
}

export function useUsers() {
  const { superAdminRole } = useAuth();
  return useQuery({ queryKey: ['super', superAdminRole, 'users'], queryFn: () => fetchUsers(superAdminRole), retry });
}

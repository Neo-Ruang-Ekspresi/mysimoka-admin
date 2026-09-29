import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '@/api/school';
import { useSchoolScope } from '@/scope/SchoolScope';
import { buildStudents } from '@/lib/analytics';

// Semua query sekolah diberi prefix ['school', schoolId, role] agar mudah di-invalidate.
function useKey(...parts: string[]) {
  const { schoolId, role } = useSchoolScope();
  return ['school', schoolId, role, ...parts] as const;
}

export function useSchoolProfile() {
  const { schoolId, role } = useSchoolScope();
  return useQuery({ queryKey: useKey('profile'), queryFn: () => api.fetchSchool(schoolId, role) });
}

export function useClasses() {
  const { schoolId, role } = useSchoolScope();
  return useQuery({ queryKey: useKey('classes'), queryFn: () => api.fetchClasses(schoolId, role) });
}

export function useEnrollments() {
  const { schoolId, role } = useSchoolScope();
  return useQuery({ queryKey: useKey('enrollments'), queryFn: () => api.fetchEnrollments(schoolId, role) });
}

export function useSchoolMembers() {
  const { schoolId, role } = useSchoolScope();
  return useQuery({ queryKey: useKey('members'), queryFn: () => api.fetchSchoolMemberships(schoolId, role) });
}

export function useMeasurementSessions() {
  const { schoolId, role } = useSchoolScope();
  return useQuery({
    queryKey: useKey('measurement-sessions'),
    queryFn: () => api.fetchMeasurementSessions(schoolId, role),
  });
}

export function useImmunizationSessions() {
  const { schoolId, role } = useSchoolScope();
  return useQuery({
    queryKey: useKey('immunization-sessions'),
    queryFn: () => api.fetchImmunizationSessions(schoolId, role),
  });
}

export function useMeasurementRecords() {
  const { role } = useSchoolScope();
  const sessions = useMeasurementSessions();
  const ids = useMemo(() => (sessions.data ?? []).map(item => item.id), [sessions.data]);
  const records = useQuery({
    queryKey: useKey('measurement-records', ids.join(',')),
    queryFn: () => api.fetchMeasurementRecords(ids, role),
    enabled: sessions.isSuccess,
  });
  return {
    ...records,
    isLoading: sessions.isLoading || records.isLoading,
    error: sessions.error ?? records.error,
    refetch: () => (sessions.error ? sessions.refetch() : records.refetch()),
  };
}

export function useImmunizationRecords() {
  const { role } = useSchoolScope();
  const sessions = useImmunizationSessions();
  const ids = useMemo(() => (sessions.data ?? []).map(item => item.id), [sessions.data]);
  const records = useQuery({
    queryKey: useKey('immunization-records', ids.join(',')),
    queryFn: () => api.fetchImmunizationRecords(ids, role),
    enabled: sessions.isSuccess,
  });
  return {
    ...records,
    isLoading: sessions.isLoading || records.isLoading,
    error: sessions.error ?? records.error,
    refetch: () => (sessions.error ? sessions.refetch() : records.refetch()),
  };
}

export function useAcademicYears() {
  const { role } = useSchoolScope();
  return useQuery({ queryKey: ['academic-years', role], queryFn: () => api.fetchAcademicYears(role) });
}

export function useGradeLevels() {
  const { role } = useSchoolScope();
  return useQuery({
    queryKey: ['grade-levels', role],
    queryFn: () => api.fetchGradeLevels(role),
    staleTime: 30 * 60_000,
  });
}

/** Siswa (satu baris per siswa) hasil gabungan enrollment + kelas. */
export function useStudents() {
  const enrollments = useEnrollments();
  const classes = useClasses();
  const data = useMemo(
    () => (enrollments.data && classes.data ? buildStudents(enrollments.data, classes.data) : undefined),
    [enrollments.data, classes.data],
  );
  return {
    data,
    isLoading: enrollments.isLoading || classes.isLoading,
    error: enrollments.error ?? classes.error,
    refetch: () => Promise.all([enrollments.refetch(), classes.refetch()]),
  };
}

/** Mutation yang otomatis me-refresh semua data sekolah aktif (+ tahun ajaran). */
export function useSchoolMutation<TInput, TResult = unknown>(fn: (input: TInput, role: string) => Promise<TResult>) {
  const { schoolId, role } = useSchoolScope();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) => fn(input, role),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['school', schoolId] }),
        queryClient.invalidateQueries({ queryKey: ['academic-years'] }),
        queryClient.invalidateQueries({ queryKey: ['my-memberships'] }),
      ]);
    },
  });
}

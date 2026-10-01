import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSchoolScope } from '@/scope/SchoolScope';
import { fetchStudentImmunizations, fetchStudentMeasurements } from '@/api/reports';
import {
  useAcademicYears,
  useClasses,
  useEnrollments,
  useImmunizationRecords,
  useImmunizationSessions,
  useMeasurementRecords,
  useMeasurementSessions,
} from './useSchoolData';

/**
 * Semua data mentah laporan sekolah. Memakai query yang sama dengan halaman Ringkasan
 * (cache React Query bersama → tidak ada fetch ganda / N+1).
 */
export function useReportSource() {
  const enrollments = useEnrollments();
  const classes = useClasses();
  const years = useAcademicYears();
  const mSessions = useMeasurementSessions();
  const iSessions = useImmunizationSessions();
  const mRecords = useMeasurementRecords();
  const iRecords = useImmunizationRecords();
  const queries = [enrollments, classes, mSessions, iSessions, mRecords, iRecords];
  return {
    enrollments: enrollments.data,
    classes: classes.data,
    years: years.data,
    measurementSessions: mSessions.data,
    immunizationSessions: iSessions.data,
    measurementRecords: mRecords.data,
    immunizationRecords: iRecords.data,
    isLoading: queries.some(query => query.isLoading),
    error: queries.find(query => query.error)?.error ?? null,
    refetch: () => queries.forEach(query => void query.refetch()),
  };
}

/** Riwayat pengukuran & imunisasi satu siswa (query terarah per student_id). */
export function useStudentHistory(studentId: string | undefined) {
  const { schoolId, role } = useSchoolScope();
  const mSessions = useMeasurementSessions();
  const iSessions = useImmunizationSessions();
  const mIds = useMemo(() => (mSessions.data ?? []).map(item => item.id), [mSessions.data]);
  const iIds = useMemo(() => (iSessions.data ?? []).map(item => item.id), [iSessions.data]);
  const measurements = useQuery({
    queryKey: ['school', schoolId, role, 'student-measurements', studentId ?? '', mIds.length],
    queryFn: () => fetchStudentMeasurements(studentId!, mIds, role),
    enabled: !!studentId && mSessions.isSuccess,
  });
  const immunizations = useQuery({
    queryKey: ['school', schoolId, role, 'student-immunizations', studentId ?? '', iIds.length],
    queryFn: () => fetchStudentImmunizations(studentId!, iIds, role),
    enabled: !!studentId && iSessions.isSuccess,
  });
  const all = [mSessions, iSessions, measurements, immunizations];
  return {
    measurements: measurements.data,
    immunizations: immunizations.data,
    measurementSessions: mSessions.data,
    immunizationSessions: iSessions.data,
    isLoading: all.some(query => query.isLoading),
    error: all.find(query => query.error)?.error ?? null,
    refetch: () => all.forEach(query => void query.refetch()),
  };
}

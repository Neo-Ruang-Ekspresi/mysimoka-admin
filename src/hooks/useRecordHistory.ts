import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSchoolScope } from '@/scope/SchoolScope';
import {
  fetchSessionRecordHistory,
  fetchStudentRecordHistory,
  groupAttempts,
  type HistoryEntry,
  type RecordKind,
} from '@/api/recordHistory';
import { useImmunizationSessions, useMeasurementSessions, useSchoolMembers } from './useSchoolData';

/**
 * Hasil riwayat percobaan siap pakai. `available` false = tabel riwayat belum ada di backend atau
 * role belum diizinkan → UI cukup menampilkan record saat ini (tanpa error).
 */
export type AttemptHistory = {
  available: boolean;
  isLoading: boolean;
  entries: HistoryEntry[];
  /** Kunci `attemptKey(sessionId, studentId)` → percobaan (terbaru dulu). */
  bySessionStudent: Map<string, HistoryEntry[]>;
};

function toAttemptHistory(data: Awaited<ReturnType<typeof fetchSessionRecordHistory>> | undefined, isLoading: boolean): AttemptHistory {
  const entries = data?.status === 'ok' ? data.entries : [];
  return {
    available: data?.status === 'ok',
    isLoading,
    entries,
    bySessionStudent: groupAttempts(entries),
  };
}

/** Semua percobaan pengukuran/imunisasi satu siswa di sesi-sesi sekolah aktif. */
export function useStudentAttempts(kind: RecordKind, studentId: string | null | undefined): AttemptHistory {
  const { schoolId, role } = useSchoolScope();
  const mSessions = useMeasurementSessions();
  const iSessions = useImmunizationSessions();
  const sessions = kind === 'measurement' ? mSessions : iSessions;
  const ids = useMemo(() => (sessions.data ?? []).map(item => item.id), [sessions.data]);
  const query = useQuery({
    queryKey: ['school', schoolId, role, 'record-history', kind, 'student', studentId ?? '', ids.join(',')],
    queryFn: () => fetchStudentRecordHistory(kind, studentId!, ids, role),
    enabled: !!studentId && sessions.isSuccess,
  });
  return useMemo(() => toAttemptHistory(query.data, query.isLoading), [query.data, query.isLoading]);
}

/** Semua percobaan di satu sesi. */
export function useSessionAttempts(kind: RecordKind, sessionId: string | null | undefined): AttemptHistory {
  const { schoolId, role } = useSchoolScope();
  const query = useQuery({
    queryKey: ['school', schoolId, role, 'record-history', kind, 'session', sessionId ?? ''],
    queryFn: () => fetchSessionRecordHistory(kind, sessionId!, role),
    enabled: !!sessionId,
  });
  return useMemo(() => toAttemptHistory(query.data, query.isLoading), [query.data, query.isLoading]);
}

/**
 * user_id → nama (anggota sekolah). Mode guru bisa kosong (permission membership) → pemanggil
 * menampilkan "-" / potongan id.
 */
export function useMemberNames(): Map<string, string> {
  const members = useSchoolMembers();
  return useMemo(() => {
    const map = new Map<string, string>();
    for (const item of members.data ?? []) {
      const name = item.user?.full_name?.trim() || item.user?.email || null;
      if (name) map.set(item.user_id, name);
    }
    return map;
  }, [members.data]);
}

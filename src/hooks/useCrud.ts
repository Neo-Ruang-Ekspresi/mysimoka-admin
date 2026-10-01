import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSchoolScope } from '@/scope/SchoolScope';
import { PermissionError } from '@/api/errors';
import { fetchFaceEmbeddings, type FaceEmbeddingRow } from '@/api/crud/faces';

/**
 * Data wajah siswa. `null` = permission select face_embeddings belum ada untuk role ini
 * (degradasi halus; UI menampilkan "tidak tersedia").
 */
export function useStudentFaces(studentId: string | null) {
  const { schoolId, role } = useSchoolScope();
  return useQuery({
    queryKey: ['school', schoolId, role, 'faces', studentId ?? ''],
    enabled: Boolean(studentId),
    queryFn: async (): Promise<FaceEmbeddingRow[] | null> => {
      try {
        return await fetchFaceEmbeddings(studentId!, role);
      } catch (error) {
        if (error instanceof PermissionError) return null;
        throw error;
      }
    },
  });
}

/**
 * State Drawer form: `target` tetap tersimpan saat menutup agar animasi keluar mulus;
 * `key` berubah tiap `show()` sehingga form di-reset (pasang sebagai `key` komponen form).
 */
export function useDrawerState<T>() {
  const [state, setState] = useState<{ open: boolean; target: T | null; key: number }>({ open: false, target: null, key: 0 });
  return {
    open: state.open,
    target: state.target,
    key: state.key,
    show: (target: T) => setState(current => ({ open: true, target, key: current.key + 1 })),
    close: () => setState(current => ({ ...current, open: false })),
  };
}

/** State multi-select tabel (Set id) + helper reset. */
export function useSelection() {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  return { selected, onChange: setSelected, clear: () => setSelected(new Set()) };
}

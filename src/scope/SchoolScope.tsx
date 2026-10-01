import { createContext, useContext, type ReactNode } from 'react';
import { capabilitiesFor, type SchoolCapabilities, type SchoolMode } from './capabilities';

export type { SchoolCapabilities, SchoolMode } from './capabilities';

/**
 * Konteks sekolah yang sedang dilihat. Halaman-halaman sekolah dipakai ulang oleh:
 *  - Admin Sekolah  → mode 'school',  role school_admin, CRUD penuh,   basePath `/sekolah`
 *  - Guru           → mode 'teacher', role teacher, catat data saja,   basePath `/pengajar`
 *  - Superadmin     → mode 'super',   role super_admin, read-only,     basePath `/superadmin/sekolah/:id`
 *
 * Gating aksi: pakai `can.*` (lihat scope/capabilities.ts). `readOnly` dipertahankan untuk
 * kompatibilitas (= tidak ada kapabilitas tulis sama sekali).
 */
export type SchoolScopeValue = {
  schoolId: string;
  schoolName: string;
  /** Header x-hasura-role untuk semua query/mutation di scope ini. */
  role: string;
  /** @deprecated pakai `can.*`. True bila mode tidak punya kapabilitas tulis apa pun. */
  readOnly: boolean;
  basePath: string;
  mode: SchoolMode;
  can: SchoolCapabilities;
};

export type SchoolScopeInput = Omit<SchoolScopeValue, 'can' | 'readOnly'> & {
  can?: Partial<SchoolCapabilities>;
};

/** Bangun nilai scope lengkap dari mode (+ override kapabilitas opsional). */
// eslint-disable-next-line react-refresh/only-export-components
export function buildSchoolScope(input: SchoolScopeInput): SchoolScopeValue {
  const can = { ...capabilitiesFor(input.mode), ...input.can };
  const readOnly = !(
    can.manageSchoolProfile ||
    can.manageTeachers ||
    can.manageClasses ||
    can.manageStudents ||
    can.createSessions ||
    can.recordData
  );
  return { ...input, can, readOnly };
}

const SchoolScopeContext = createContext<SchoolScopeValue | null>(null);

export function SchoolScopeProvider({ value, children }: { value: SchoolScopeValue; children: ReactNode }) {
  return <SchoolScopeContext.Provider value={value}>{children}</SchoolScopeContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSchoolScope(): SchoolScopeValue {
  const context = useContext(SchoolScopeContext);
  if (!context) throw new Error('useSchoolScope harus dipakai di dalam SchoolScopeProvider');
  return context;
}

import { createContext, useContext, type ReactNode } from 'react';

/**
 * Konteks sekolah yang sedang dilihat. Halaman-halaman sekolah dipakai ulang oleh:
 *  - Admin Sekolah  → role school_admin, bisa CRUD, basePath `/sekolah`
 *  - Superadmin     → role super_admin, read-only, basePath `/superadmin/sekolah/:id`
 */
export type SchoolScopeValue = {
  schoolId: string;
  schoolName: string;
  role: string;
  readOnly: boolean;
  basePath: string;
  mode: 'school' | 'super';
};

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

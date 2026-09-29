import { NavLink, Outlet, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { fetchSchool } from '@/api/school';
import { PermissionError } from '@/api/errors';
import { isUuid, cn } from '@/lib/object';
import { SchoolScopeProvider } from '@/scope/SchoolScope';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { SuperAdminNotice } from './SuperAdminNotice';

const TABS = [
  { to: '', label: 'Ringkasan', end: true },
  { to: 'siswa', label: 'Siswa' },
  { to: 'kelas', label: 'Kelas' },
  { to: 'guru', label: 'Guru' },
  { to: 'pengukuran', label: 'Pengukuran' },
  { to: 'imunisasi', label: 'Imunisasi' },
  { to: 'profil', label: 'Profil' },
];

/** Drill-down sekolah untuk Superadmin — memakai ulang halaman sekolah dalam mode read-only. */
export function SchoolDetailLayout() {
  const { schoolId = '' } = useParams();
  const { superAdminRole } = useAuth();
  const school = useQuery({
    queryKey: ['school', schoolId, superAdminRole, 'profile'],
    queryFn: () => fetchSchool(schoolId, superAdminRole),
    enabled: isUuid(schoolId),
    retry: (count, error) => !(error instanceof PermissionError) && count < 2,
  });

  if (!isUuid(schoolId)) return <EmptyState title="ID sekolah tidak valid" />;
  const base = `/superadmin/sekolah/${schoolId}`;

  return (
    <div>
      <PageHeader
        backTo="/superadmin/sekolah"
        backLabel="Semua sekolah"
        title={school.data?.name ?? (school.isLoading ? 'Memuat…' : 'Sekolah')}
        description={school.data ? `${school.data.number ? `NPSN ${school.data.number} · ` : ''}${school.data.address ?? ''}` : undefined}
      />
      <SuperAdminNotice />
      <nav className="-mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0" aria-label="Detail sekolah">
        {TABS.map(tab => (
          <NavLink
            key={tab.label}
            to={tab.to ? `${base}/${tab.to}` : base}
            end={tab.end}
            className={({ isActive }) =>
              cn(
                '-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'border-brand-500 text-brand-600 dark:text-brand-300' : 'border-transparent text-fg-subtle hover:text-fg',
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      {school.error ? (
        <Card>
          <ErrorState error={school.error} onRetry={() => void school.refetch()} />
        </Card>
      ) : school.isLoading ? (
        <LoadingState />
      ) : !school.data ? (
        <Card>
          <EmptyState title="Sekolah tidak ditemukan" />
        </Card>
      ) : (
        <SchoolScopeProvider
          value={{
            schoolId,
            schoolName: school.data.name ?? 'Sekolah',
            role: superAdminRole,
            readOnly: true,
            basePath: base,
            mode: 'super',
          }}
        >
          <Outlet />
        </SchoolScopeProvider>
      )}
    </div>
  );
}

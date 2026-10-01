import { Outlet, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { fetchSchool } from '@/api/school';
import { PermissionError } from '@/api/errors';
import { isUuid } from '@/lib/object';
import { SchoolScopeProvider, buildSchoolScope } from '@/scope/SchoolScope';
import { schoolPagesFor } from '@/routes/schoolPages';
import { NavTabs } from '@/components/ui/Tabs';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { SuperAdminNotice } from './SuperAdminNotice';

const TABS = schoolPagesFor('super').filter(page => page.inNav !== false);

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
      <NavTabs
        ariaLabel="Detail sekolah"
        className="-mx-4 mb-5 px-4 sm:mx-0 sm:px-0"
        items={TABS.map(tab => ({ to: tab.path ? `${base}/${tab.path}` : base, label: tab.tabLabel ?? tab.label, end: tab.path === '' }))}
      />
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
          value={buildSchoolScope({
            schoolId,
            schoolName: school.data.name ?? 'Sekolah',
            role: superAdminRole,
            basePath: base,
            mode: 'super',
          })}
        >
          <Outlet />
        </SchoolScopeProvider>
      )}
    </div>
  );
}

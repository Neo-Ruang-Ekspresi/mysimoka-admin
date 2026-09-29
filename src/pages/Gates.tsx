import type { ReactNode } from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router';
import { LogOut, ShieldOff } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { SchoolScopeProvider } from '@/scope/SchoolScope';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

function FullPage({ children }: { children: ReactNode }) {
  return <div className="flex min-h-full items-center justify-center p-4">{children}</div>;
}

/** Arahkan user ke dashboard sesuai role setelah login. */
export function RootRedirect() {
  const { canSchoolAdmin, canSuperAdmin, hasSuperAdminRole, membershipsLoading, membershipsError, adminSchools } = useAuth();
  if (membershipsLoading) {
    return (
      <FullPage>
        <LoadingState label="Menyiapkan dashboard…" />
      </FullPage>
    );
  }
  if (hasSuperAdminRole && adminSchools.length === 0) return <Navigate to="/superadmin" replace />;
  if (canSchoolAdmin) return <Navigate to="/sekolah" replace />;
  if (canSuperAdmin) return <Navigate to="/superadmin" replace />;
  if (membershipsError) {
    return (
      <FullPage>
        <ErrorState error={membershipsError} onRetry={() => window.location.reload()} />
      </FullPage>
    );
  }
  return <Navigate to="/tidak-ada-akses" replace />;
}

export function NoAccessPage() {
  const { logout, displayName, roles } = useAuth();
  return (
    <FullPage>
      <div className="w-full max-w-md rounded-2xl border border-line bg-card p-6 text-center">
        <EmptyState
          icon={<ShieldOff className="size-6" />}
          title="Akun tidak memiliki akses admin"
          description={
            <>
              Halo {displayName}. Dashboard ini hanya untuk <b>Admin Sekolah</b> (role school_admin) dan{' '}
              <b>Superadmin</b> (role super_admin). Role Anda saat ini: {roles.length > 0 ? roles.join(', ') : '-'}.
              Guru dapat memakai aplikasi mobile MySimoka.
            </>
          }
          action={
            <Button variant="secondary" icon={<LogOut className="size-4" />} onClick={logout}>
              Keluar
            </Button>
          }
        />
      </div>
    </FullPage>
  );
}

export function NotFoundPage() {
  return (
    <FullPage>
      <EmptyState
        title="Halaman tidak ditemukan"
        description="Alamat yang Anda buka tidak tersedia."
        action={
          <Link to="/" className="text-sm font-medium text-brand-600 hover:underline">
            Kembali ke beranda
          </Link>
        }
      />
    </FullPage>
  );
}

/** Pastikan user admin sekolah & sediakan scope sekolah aktif. */
export function SchoolAdminGate() {
  const { canSchoolAdmin, currentSchool, membershipsLoading, membershipsError, schoolAdminRole } = useAuth();
  if (membershipsLoading) {
    return <LoadingState label="Memuat data sekolah…" />;
  }
  if (!canSchoolAdmin) return <Navigate to="/" replace />;
  if (!currentSchool) {
    return membershipsError ? (
      <ErrorState error={membershipsError} onRetry={() => window.location.reload()} />
    ) : (
      <EmptyState
        title="Belum terhubung ke sekolah"
        description="Akun Anda memiliki role admin sekolah, tetapi belum ada membership sekolah yang aktif. Buat atau gabung sekolah melalui aplikasi mobile MySimoka."
      />
    );
  }
  return (
    <SchoolScopeProvider
      value={{
        schoolId: currentSchool.schoolId,
        schoolName: currentSchool.name,
        role: schoolAdminRole,
        readOnly: false,
        basePath: '/sekolah',
        mode: 'school',
      }}
    >
      {/* key → reset state halaman saat sekolah diganti */}
      <div key={currentSchool.schoolId}>
        <Outlet />
      </div>
    </SchoolScopeProvider>
  );
}

export function SuperAdminGate({ children }: { children: ReactNode }) {
  const { canSuperAdmin, membershipsLoading } = useAuth();
  if (membershipsLoading) return <LoadingState />;
  if (!canSuperAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

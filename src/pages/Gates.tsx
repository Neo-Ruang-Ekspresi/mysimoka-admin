import type { ReactNode } from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router';
import { LogOut, ShieldOff } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { SchoolScopeProvider, buildSchoolScope } from '@/scope/SchoolScope';
import { TEACHER_BASE_PATH } from '@/routes/paths';
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

/**
 * Arahkan user ke dashboard sesuai role setelah login. Prioritas:
 * super_admin tanpa membership sekolah → /superadmin; admin sekolah → /sekolah;
 * guru → /pengajar; superadmin preview → /superadmin; selain itu → tidak ada akses.
 */
export function RootRedirect() {
  const {
    canSchoolAdmin,
    canSuperAdmin,
    canTeacher,
    hasSuperAdminRole,
    membershipsLoading,
    membershipsError,
    adminSchools,
    teacherSchools,
  } = useAuth();
  if (membershipsLoading) {
    return (
      <FullPage>
        <LoadingState label="Menyiapkan dashboard…" />
      </FullPage>
    );
  }
  if (hasSuperAdminRole && adminSchools.length === 0 && teacherSchools.length === 0) return <Navigate to="/superadmin" replace />;
  if (canSchoolAdmin) return <Navigate to="/sekolah" replace />;
  if (canTeacher) return <Navigate to={TEACHER_BASE_PATH} replace />;
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
  const { logout, displayName, roles, canSchoolAdmin, canSuperAdmin, canTeacher, membershipsLoading } = useAuth();
  // Login ulang dengan akun lain kembali ke halaman ini (state `from`); kirim ke dashboard bila kini berhak.
  if (canSchoolAdmin || canSuperAdmin || canTeacher) return <Navigate to="/" replace />;
  if (membershipsLoading) {
    return (
      <FullPage>
        <LoadingState label="Memeriksa akses…" />
      </FullPage>
    );
  }
  return (
    <FullPage>
      <div className="w-full max-w-md rounded-2xl border border-line bg-card p-6 text-center">
        <EmptyState
          icon={<ShieldOff className="size-6" />}
          title="Akun belum memiliki akses dashboard"
          description={
            <>
              Halo {displayName}. Dashboard ini untuk <b>Admin Sekolah</b>, <b>Guru</b> yang sudah terhubung ke sekolah,
              dan <b>Superadmin</b>. Role Anda saat ini: {roles.length > 0 ? roles.join(', ') : '-'}. Bila Anda guru,
              gabung ke sekolah terlebih dahulu memakai kode gabung melalui aplikasi mobile MySimoka, lalu masuk kembali.
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
      value={buildSchoolScope({
        schoolId: currentSchool.schoolId,
        schoolName: currentSchool.name,
        role: schoolAdminRole,
        basePath: '/sekolah',
        mode: 'school',
      })}
    >
      {/* key → reset state halaman saat sekolah diganti */}
      <div key={currentSchool.schoolId}>
        <Outlet />
      </div>
    </SchoolScopeProvider>
  );
}

/** Pastikan user guru di sekolah aktif & sediakan scope mode guru (role Hasura `teacher`). */
export function TeacherGate() {
  const { currentTeacherSchool, membershipsLoading, membershipsError, teacherRole } = useAuth();
  if (membershipsLoading) return <LoadingState label="Memuat data sekolah…" />;
  if (!currentTeacherSchool) {
    return membershipsError ? (
      <ErrorState error={membershipsError} onRetry={() => window.location.reload()} />
    ) : (
      <Navigate to="/" replace />
    );
  }
  return (
    <SchoolScopeProvider
      value={buildSchoolScope({
        schoolId: currentTeacherSchool.schoolId,
        schoolName: currentTeacherSchool.name,
        role: teacherRole,
        basePath: TEACHER_BASE_PATH,
        mode: 'teacher',
      })}
    >
      <div key={currentTeacherSchool.schoolId}>
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

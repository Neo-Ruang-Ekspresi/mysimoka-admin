import { Route, Routes } from 'react-router';
import {
  Building2,
  CalendarRange,
  GraduationCap,
  LayoutDashboard,
  Ruler,
  School,
  Syringe,
  UserCog,
  Users,
  BarChart3,
} from 'lucide-react';
import { AppLayout, type NavItem } from '@/components/layout/AppLayout';
import { LoginPage } from '@/pages/LoginPage';
import { NoAccessPage, NotFoundPage, RequireAuth, RootRedirect, SchoolAdminGate, SuperAdminGate } from '@/pages/Gates';
import { OverviewPage } from '@/pages/school/OverviewPage';
import { StudentsPage } from '@/pages/school/StudentsPage';
import { ClassesPage } from '@/pages/school/ClassesPage';
import { TeachersPage } from '@/pages/school/TeachersPage';
import { AcademicYearsPage } from '@/pages/school/AcademicYearsPage';
import { SessionsPage } from '@/pages/school/SessionsPage';
import { SessionDetailPage } from '@/pages/school/SessionDetailPage';
import { SchoolProfilePage } from '@/pages/school/SchoolProfilePage';
import { GlobalOverviewPage } from '@/pages/superadmin/GlobalOverviewPage';
import { SchoolsPage } from '@/pages/superadmin/SchoolsPage';
import { SchoolDetailLayout } from '@/pages/superadmin/SchoolDetailLayout';
import { UsersPage } from '@/pages/superadmin/UsersPage';

const SCHOOL_NAV: NavItem[] = [
  { to: '/sekolah', label: 'Ringkasan', icon: LayoutDashboard, end: true },
  { to: '/sekolah/siswa', label: 'Siswa', icon: Users },
  { to: '/sekolah/kelas', label: 'Kelas', icon: School },
  { to: '/sekolah/guru', label: 'Guru', icon: GraduationCap },
  { to: '/sekolah/tahun-ajaran', label: 'Tahun Ajaran', icon: CalendarRange },
  { to: '/sekolah/pengukuran', label: 'Sesi Pengukuran', icon: Ruler },
  { to: '/sekolah/imunisasi', label: 'Sesi Imunisasi', icon: Syringe },
  { to: '/sekolah/profil', label: 'Profil Sekolah', icon: Building2 },
];

const SUPER_NAV: NavItem[] = [
  { to: '/superadmin', label: 'Statistik Global', icon: BarChart3, end: true },
  { to: '/superadmin/sekolah', label: 'Sekolah', icon: Building2 },
  { to: '/superadmin/pengguna', label: 'Pengguna', icon: UserCog },
];

/** Halaman sekolah — dipakai ulang oleh admin sekolah & drill-down superadmin. */
function schoolRoutes(options: { withAdminPages: boolean }) {
  return (
    <>
      <Route index element={<OverviewPage />} />
      <Route path="siswa" element={<StudentsPage />} />
      <Route path="kelas" element={<ClassesPage />} />
      <Route path="guru" element={<TeachersPage />} />
      {options.withAdminPages ? <Route path="tahun-ajaran" element={<AcademicYearsPage />} /> : null}
      <Route path="pengukuran" element={<SessionsPage kind="measurement" />} />
      <Route path="pengukuran/:sessionId" element={<SessionDetailPage kind="measurement" />} />
      <Route path="imunisasi" element={<SessionsPage kind="immunization" />} />
      <Route path="imunisasi/:sessionId" element={<SessionDetailPage kind="immunization" />} />
      <Route path="profil" element={<SchoolProfilePage />} />
    </>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <RootRedirect />
          </RequireAuth>
        }
      />
      <Route
        path="/tidak-ada-akses"
        element={
          <RequireAuth>
            <NoAccessPage />
          </RequireAuth>
        }
      />
      <Route
        path="/sekolah"
        element={
          <RequireAuth>
            <AppLayout items={SCHOOL_NAV} mode="school" subtitle="Admin Sekolah" />
          </RequireAuth>
        }
      >
        <Route element={<SchoolAdminGate />}>{schoolRoutes({ withAdminPages: true })}</Route>
      </Route>
      <Route
        path="/superadmin"
        element={
          <RequireAuth>
            <SuperAdminGate>
              <AppLayout items={SUPER_NAV} mode="super" subtitle="Superadmin" />
            </SuperAdminGate>
          </RequireAuth>
        }
      >
        <Route index element={<GlobalOverviewPage />} />
        <Route path="sekolah" element={<SchoolsPage />} />
        <Route path="sekolah/:schoolId" element={<SchoolDetailLayout />}>
          {schoolRoutes({ withAdminPages: false })}
        </Route>
        <Route path="pengguna" element={<UsersPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

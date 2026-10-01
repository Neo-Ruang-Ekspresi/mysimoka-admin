import { Route, Routes } from 'react-router';
import { BarChart3, Building2, UserCog } from 'lucide-react';
import { AppLayout, type NavItem } from '@/components/layout/AppLayout';
import { LoginPage } from '@/pages/LoginPage';
import {
  NoAccessPage,
  NotFoundPage,
  RequireAuth,
  RootRedirect,
  SchoolAdminGate,
  SuperAdminGate,
  TeacherGate,
} from '@/pages/Gates';
import { GlobalOverviewPage } from '@/pages/superadmin/GlobalOverviewPage';
import { SchoolsPage } from '@/pages/superadmin/SchoolsPage';
import { SchoolDetailLayout } from '@/pages/superadmin/SchoolDetailLayout';
import { UsersPage } from '@/pages/superadmin/UsersPage';
import { SCHOOL_BASE_PATH, SUPER_BASE_PATH, TEACHER_BASE_PATH } from '@/routes/paths';
import { schoolNavFor, schoolRoutes } from '@/routes/schoolPages';

// Menu sekolah diturunkan dari registri halaman (routes/schoolPages.tsx) per mode.
const SCHOOL_NAV = schoolNavFor('school', SCHOOL_BASE_PATH);
const TEACHER_NAV = schoolNavFor('teacher', TEACHER_BASE_PATH);

const SUPER_NAV: NavItem[] = [
  { to: SUPER_BASE_PATH, label: 'Statistik Global', icon: BarChart3, end: true },
  { to: `${SUPER_BASE_PATH}/sekolah`, label: 'Sekolah', icon: Building2 },
  { to: `${SUPER_BASE_PATH}/pengguna`, label: 'Pengguna', icon: UserCog },
];

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
        path={SCHOOL_BASE_PATH}
        element={
          <RequireAuth>
            <AppLayout items={SCHOOL_NAV} mode="school" subtitle="Admin Sekolah" />
          </RequireAuth>
        }
      >
        <Route element={<SchoolAdminGate />}>{schoolRoutes('school')}</Route>
      </Route>
      <Route
        path={TEACHER_BASE_PATH}
        element={
          <RequireAuth>
            <AppLayout items={TEACHER_NAV} mode="teacher" subtitle="Guru" />
          </RequireAuth>
        }
      >
        <Route element={<TeacherGate />}>{schoolRoutes('teacher')}</Route>
      </Route>
      <Route
        path={SUPER_BASE_PATH}
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
          {schoolRoutes('super')}
        </Route>
        <Route path="pengguna" element={<UsersPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

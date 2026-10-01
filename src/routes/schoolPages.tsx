import type { ReactNode } from 'react';
import { Route } from 'react-router';
import {
  Building2,
  CalendarRange,
  GraduationCap,
  LayoutDashboard,
  Ruler,
  School,
  Syringe,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { NavItem } from '@/components/layout/AppLayout';
import { capabilitiesFor, type SchoolCapabilities, type SchoolMode } from '@/scope/capabilities';
import { OverviewPage } from '@/pages/school/OverviewPage';
import { StudentsPage } from '@/pages/school/StudentsPage';
import { ClassesPage } from '@/pages/school/ClassesPage';
import { TeachersPage } from '@/pages/school/TeachersPage';
import { AcademicYearsPage } from '@/pages/school/AcademicYearsPage';
import { SessionsPage } from '@/pages/school/SessionsPage';
import { SessionDetailPage } from '@/pages/school/SessionDetailPage';
import { SchoolProfilePage } from '@/pages/school/SchoolProfilePage';

/**
 * Registri tunggal halaman sekolah — dipakai untuk route, menu sidebar (admin & guru) dan
 * tab drill-down superadmin. Tambah halaman baru = tambah satu entri di sini.
 *
 * `visible(can)` menentukan halaman ada (route + menu) untuk sebuah mode. Halaman yang
 * tidak visible tidak didaftarkan sebagai route (→ 404), bukan sekadar disembunyikan.
 */
export type SchoolPageDef = {
  /** Segmen relatif terhadap basePath; '' = index. */
  path: string;
  label: string;
  /** Label pendek untuk tab superadmin (opsional). */
  tabLabel?: string;
  icon: LucideIcon;
  element: ReactNode;
  visible?: (can: SchoolCapabilities) => boolean;
  /** Route tambahan di bawah halaman ini (mis. detail). Tidak muncul di menu. */
  children?: Array<{ path: string; element: ReactNode }>;
  /** Tampil di menu? default true. */
  inNav?: boolean;
};

export const SCHOOL_PAGES: SchoolPageDef[] = [
  { path: '', label: 'Ringkasan', icon: LayoutDashboard, element: <OverviewPage /> },
  { path: 'siswa', label: 'Siswa', icon: Users, element: <StudentsPage /> },
  { path: 'kelas', label: 'Kelas', icon: School, element: <ClassesPage /> },
  { path: 'guru', label: 'Guru', icon: GraduationCap, element: <TeachersPage />, visible: can => can.viewTeachers },
  {
    path: 'tahun-ajaran',
    label: 'Tahun Ajaran',
    icon: CalendarRange,
    element: <AcademicYearsPage />,
    visible: can => can.manageAcademicYears,
  },
  {
    path: 'pengukuran',
    label: 'Sesi Pengukuran',
    tabLabel: 'Pengukuran',
    icon: Ruler,
    element: <SessionsPage kind="measurement" />,
    children: [{ path: 'pengukuran/:sessionId', element: <SessionDetailPage kind="measurement" /> }],
  },
  {
    path: 'imunisasi',
    label: 'Sesi Imunisasi',
    tabLabel: 'Imunisasi',
    icon: Syringe,
    element: <SessionsPage kind="immunization" />,
    children: [{ path: 'imunisasi/:sessionId', element: <SessionDetailPage kind="immunization" /> }],
  },
  { path: 'profil', label: 'Profil Sekolah', tabLabel: 'Profil', icon: Building2, element: <SchoolProfilePage /> },
];

export function schoolPagesFor(mode: SchoolMode): SchoolPageDef[] {
  const can = capabilitiesFor(mode);
  return SCHOOL_PAGES.filter(page => !page.visible || page.visible(can));
}

export function schoolNavFor(mode: SchoolMode, basePath: string): NavItem[] {
  return schoolPagesFor(mode)
    .filter(page => page.inNav !== false)
    .map(page => ({
      to: page.path ? `${basePath}/${page.path}` : basePath,
      label: page.label,
      icon: page.icon,
      end: page.path === '',
    }));
}

/** Elemen <Route> untuk dipasang di bawah layout/gate sekolah. */
export function schoolRoutes(mode: SchoolMode) {
  return schoolPagesFor(mode).flatMap(page => [
    page.path ? (
      <Route key={page.path} path={page.path} element={page.element} />
    ) : (
      <Route key="index" index element={page.element} />
    ),
    ...(page.children ?? []).map(child => <Route key={child.path} path={child.path} element={child.element} />),
  ]);
}

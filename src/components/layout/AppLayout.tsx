import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate, useOutlet } from 'react-router';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { Building2, ChevronDown, GraduationCap, LogOut, Menu, Moon, ShieldCheck, Sun, X, type LucideIcon } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { cn } from '@/lib/object';
import { initials } from '@/lib/format';
import { DURATION, EASE_OUT, backdrop, drawerPanel, pageVariants, springSnappy } from '@/lib/motion';
import { SCHOOL_BASE_PATH, SUPER_BASE_PATH, TEACHER_BASE_PATH } from '@/routes/paths';
import { useTheme } from './theme';

export type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean };
export type LayoutMode = 'school' | 'super' | 'teacher';

const MODE_META: Record<LayoutMode, { label: string; path: string; icon: LucideIcon }> = {
  school: { label: 'Admin Sekolah', path: SCHOOL_BASE_PATH, icon: Building2 },
  teacher: { label: 'Guru', path: TEACHER_BASE_PATH, icon: GraduationCap },
  super: { label: 'Superadmin', path: SUPER_BASE_PATH, icon: ShieldCheck },
};

const dropdownMotion = {
  initial: { opacity: 0, y: -4, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: DURATION.fast, ease: EASE_OUT } },
  exit: { opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.1 } },
};

/** Mode dashboard yang tersedia untuk user (urutan prioritas). */
function useAvailableModes(): LayoutMode[] {
  const { canSchoolAdmin, canSuperAdmin, canTeacher } = useAuth();
  return (['school', 'teacher', 'super'] as const).filter(mode =>
    mode === 'school' ? canSchoolAdmin : mode === 'teacher' ? canTeacher : canSuperAdmin,
  );
}

function Brand({ subtitle }: { subtitle: string }) {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <img src="/logo.png" alt="" className="size-9 rounded-lg bg-white object-contain p-0.5" />
      <div className="leading-tight">
        <p className="text-sm font-bold tracking-tight text-white">MySimoka</p>
        <p className="text-[11px] text-brand-300">{subtitle}</p>
      </div>
    </div>
  );
}

function Sidebar({
  items,
  subtitle,
  onNavigate,
  scope,
}: {
  items: NavItem[];
  subtitle: string;
  onNavigate?: () => void;
  /** Id unik per instance (desktop/mobile) agar indikator layoutId tidak saling melompat. */
  scope: string;
}) {
  return (
    <div className="flex h-full flex-col gap-6 bg-brand-900 px-3 py-5 dark:bg-[#0c1620]">
      <Brand subtitle={subtitle} />
      <LayoutGroup id={scope}>
        <nav className="flex flex-col gap-0.5" aria-label="Navigasi utama">
          {items.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'text-white' : 'text-brand-100/75 hover:bg-white/6 hover:text-white',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive ? (
                    <motion.span
                      layoutId="sidebar-active"
                      className="absolute inset-0 rounded-lg bg-white/12"
                      transition={springSnappy}
                      aria-hidden
                    >
                      <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-brand-300" />
                    </motion.span>
                  ) : null}
                  <item.icon className="relative size-4.5 shrink-0 transition-transform duration-200 group-hover:scale-110 motion-reduce:transform-none" />
                  <span className="relative">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </LayoutGroup>
    </div>
  );
}

function useClickOutside(onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onOutside();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onOutside]);
  return ref;
}

function SchoolSwitcher({ mode }: { mode: 'school' | 'teacher' }) {
  const { adminSchools, currentSchool, teacherSchools, currentTeacherSchool, setCurrentSchoolId } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  const schools = mode === 'teacher' ? teacherSchools : adminSchools;
  const current = mode === 'teacher' ? currentTeacherSchool : currentSchool;
  if (!current) return null;
  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="flex max-w-[16rem] items-center gap-2 rounded-lg border border-line bg-card px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-card-muted"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Building2 className="size-4 shrink-0 text-brand-500" />
        <span className="truncate font-medium text-fg">{current.name}</span>
        {schools.length > 1 ? (
          <ChevronDown className={cn('size-4 shrink-0 text-fg-subtle transition-transform duration-200', open && 'rotate-180')} />
        ) : null}
      </button>
      <AnimatePresence>
        {open && schools.length > 1 ? (
          <motion.div
            {...dropdownMotion}
            className="absolute left-0 z-40 mt-1 w-72 origin-top-left rounded-xl border border-line bg-card p-1 shadow-lg"
            role="listbox"
          >
            <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Pilih sekolah</p>
            {schools.map(school => (
              <button
                key={school.schoolId}
                type="button"
                role="option"
                aria-selected={school.schoolId === current.schoolId}
                onClick={() => {
                  setCurrentSchoolId(school.schoolId);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full flex-col rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-card-muted',
                  school.schoolId === current.schoolId && 'bg-brand-50 dark:bg-brand-900/40',
                )}
              >
                <span className="font-medium text-fg">{school.name}</span>
                {school.number ? <span className="text-xs text-fg-subtle">NPSN {school.number}</span> : null}
              </button>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function ModeSwitch({ mode }: { mode: LayoutMode }) {
  const modes = useAvailableModes();
  const navigate = useNavigate();
  if (modes.length < 2) return null;
  return (
    <LayoutGroup id="mode-switch">
      <div
        className="hidden rounded-lg border border-line bg-card-muted p-0.5 text-xs font-medium sm:flex"
        role="tablist"
        aria-label="Mode dashboard"
      >
        {modes.map(key => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mode === key}
            onClick={() => navigate(MODE_META[key].path)}
            className={cn('relative rounded-md px-2.5 py-1 transition-colors', mode === key ? 'text-fg' : 'text-fg-subtle hover:text-fg')}
          >
            {mode === key ? (
              <motion.span
                layoutId="mode-pill"
                className="absolute inset-0 rounded-md bg-card shadow-sm"
                transition={springSnappy}
                aria-hidden
              />
            ) : null}
            <span className="relative">{MODE_META[key].label}</span>
          </button>
        ))}
      </div>
    </LayoutGroup>
  );
}

function UserMenu({ mode }: { mode: LayoutMode }) {
  const { displayName, email, logout } = useAuth();
  const modes = useAvailableModes();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="flex items-center gap-2 rounded-full p-0.5 pr-1 transition-colors hover:bg-card-muted"
        aria-label="Menu akun"
        aria-expanded={open}
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-brand-500 text-xs font-semibold text-white">
          {initials(displayName)}
        </span>
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            {...dropdownMotion}
            className="absolute right-0 z-40 mt-1 w-64 origin-top-right rounded-xl border border-line bg-card p-1 shadow-lg"
          >
            <div className="border-b border-line px-3 py-2">
              <p className="truncate text-sm font-semibold text-fg">{displayName}</p>
              {email ? <p className="truncate text-xs text-fg-subtle">{email}</p> : null}
              <p className="mt-0.5 text-[11px] font-medium text-brand-600 dark:text-brand-300">Mode {MODE_META[mode].label}</p>
            </div>
            {modes
              .filter(key => key !== mode)
              .map(key => {
                const Icon = MODE_META[key].icon;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      navigate(MODE_META[key].path);
                    }}
                    className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-fg transition-colors hover:bg-card-muted sm:hidden"
                  >
                    <Icon className="size-4" />
                    Mode {MODE_META[key].label}
                  </button>
                );
              })}
            <button
              type="button"
              onClick={() => {
                logout();
                navigate('/login', { replace: true });
              }}
              className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger transition-colors hover:bg-card-muted"
            >
              <LogOut className="size-4" />
              Keluar
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/**
 * Outlet beranimasi: fade/slide singkat per perubahan path. Elemen lama "dibekukan" lewat
 * useOutlet() agar tetap merender route lama selama animasi keluar.
 */
function AnimatedOutlet() {
  const location = useLocation();
  const outlet = useOutlet();
  return (
    <AnimatePresence mode="wait" initial={false} onExitComplete={() => window.scrollTo({ top: 0 })}>
      <motion.div key={location.pathname} variants={pageVariants} initial="initial" animate="animate" exit="exit">
        {outlet}
      </motion.div>
    </AnimatePresence>
  );
}

export function AppLayout({
  items,
  mode,
  subtitle,
  topbarExtra,
}: {
  items: NavItem[];
  mode: LayoutMode;
  subtitle: string;
  topbarExtra?: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [theme, toggleTheme] = useTheme();
  const location = useLocation();

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex min-h-full">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 lg:block">
        <Sidebar items={items} subtitle={subtitle} scope="sidebar-desktop" />
      </aside>

      <AnimatePresence>
        {mobileOpen ? (
          <div key="mobile-nav" className="fixed inset-0 z-40 lg:hidden">
            <motion.div
              variants={backdrop}
              initial="hidden"
              animate="show"
              exit="exit"
              className="absolute inset-0 bg-[#162534]/50"
              onClick={() => setMobileOpen(false)}
              aria-hidden
            />
            <motion.div
              variants={drawerPanel('left')}
              initial="hidden"
              animate="show"
              exit="exit"
              className="relative h-full w-64 max-w-[80%]"
            >
              <Sidebar items={items} subtitle={subtitle} scope="sidebar-mobile" onNavigate={() => setMobileOpen(false)} />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="absolute right-2 top-5 rounded-md p-1 text-white/80 hover:bg-white/10"
                aria-label="Tutup menu"
              >
                <X className="size-5" />
              </button>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-card/90 px-4 backdrop-blur sm:gap-3 sm:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-1.5 text-fg-muted hover:bg-card-muted lg:hidden"
            aria-label="Buka menu"
          >
            <Menu className="size-5" />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {mode === 'super' ? topbarExtra : <SchoolSwitcher mode={mode} />}
          </div>
          <ModeSwitch mode={mode} />
          <button
            type="button"
            onClick={toggleTheme}
            className="rounded-md p-2 text-fg-muted transition-colors hover:bg-card-muted"
            aria-label={theme === 'dark' ? 'Mode terang' : 'Mode gelap'}
            title={theme === 'dark' ? 'Mode terang' : 'Mode gelap'}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={theme}
                className="block"
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: DURATION.fast }}
              >
                {theme === 'dark' ? <Sun className="size-4.5" /> : <Moon className="size-4.5" />}
              </motion.span>
            </AnimatePresence>
          </button>
          <UserMenu mode={mode} />
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
          <AnimatedOutlet />
        </main>
      </div>
    </div>
  );
}

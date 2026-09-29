import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { Building2, ChevronDown, LogOut, Menu, Moon, ShieldCheck, Sun, X, type LucideIcon } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { cn } from '@/lib/object';
import { initials } from '@/lib/format';
import { useTheme } from './theme';

export type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean };

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

function Sidebar({ items, subtitle, onNavigate }: { items: NavItem[]; subtitle: string; onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-6 bg-brand-900 px-3 py-5 dark:bg-[#0c1620]">
      <Brand subtitle={subtitle} />
      <nav className="flex flex-col gap-0.5" aria-label="Navigasi utama">
        {items.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'bg-white/12 text-white' : 'text-brand-100/75 hover:bg-white/6 hover:text-white',
              )
            }
          >
            <item.icon className="size-4.5 shrink-0" />
            {item.label}
          </NavLink>
        ))}
      </nav>
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

function SchoolSwitcher() {
  const { adminSchools, currentSchool, setCurrentSchoolId } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  if (!currentSchool) return null;
  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="flex max-w-[16rem] items-center gap-2 rounded-lg border border-line bg-card px-2.5 py-1.5 text-left text-sm hover:bg-card-muted"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Building2 className="size-4 shrink-0 text-brand-500" />
        <span className="truncate font-medium text-fg">{currentSchool.name}</span>
        {adminSchools.length > 1 ? <ChevronDown className="size-4 shrink-0 text-fg-subtle" /> : null}
      </button>
      {open && adminSchools.length > 1 ? (
        <div className="absolute left-0 z-40 mt-1 w-72 rounded-xl border border-line bg-card p-1 shadow-lg" role="listbox">
          <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Pilih sekolah</p>
          {adminSchools.map(school => (
            <button
              key={school.schoolId}
              type="button"
              role="option"
              aria-selected={school.schoolId === currentSchool.schoolId}
              onClick={() => {
                setCurrentSchoolId(school.schoolId);
                setOpen(false);
              }}
              className={cn(
                'flex w-full flex-col rounded-lg px-3 py-2 text-left text-sm hover:bg-card-muted',
                school.schoolId === currentSchool.schoolId && 'bg-brand-50 dark:bg-brand-900/40',
              )}
            >
              <span className="font-medium text-fg">{school.name}</span>
              {school.number ? <span className="text-xs text-fg-subtle">NPSN {school.number}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ModeSwitch({ mode }: { mode: 'school' | 'super' }) {
  const { canSchoolAdmin, canSuperAdmin } = useAuth();
  const navigate = useNavigate();
  if (!(canSchoolAdmin && canSuperAdmin)) return null;
  return (
    <div className="hidden rounded-lg border border-line bg-card-muted p-0.5 text-xs font-medium sm:flex" role="tablist" aria-label="Mode dashboard">
      {(
        [
          ['school', 'Admin Sekolah', '/sekolah'],
          ['super', 'Superadmin', '/superadmin'],
        ] as const
      ).map(([key, label, path]) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={mode === key}
          onClick={() => navigate(path)}
          className={cn(
            'rounded-md px-2.5 py-1 transition-colors',
            mode === key ? 'bg-card text-fg shadow-sm' : 'text-fg-subtle hover:text-fg',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function UserMenu({ mode }: { mode: 'school' | 'super' }) {
  const { displayName, email, logout, canSchoolAdmin, canSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="flex items-center gap-2 rounded-full p-0.5 pr-1 hover:bg-card-muted"
        aria-label="Menu akun"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-brand-500 text-xs font-semibold text-white">
          {initials(displayName)}
        </span>
      </button>
      {open ? (
        <div className="absolute right-0 z-40 mt-1 w-64 rounded-xl border border-line bg-card p-1 shadow-lg">
          <div className="border-b border-line px-3 py-2">
            <p className="truncate text-sm font-semibold text-fg">{displayName}</p>
            {email ? <p className="truncate text-xs text-fg-subtle">{email}</p> : null}
          </div>
          {canSchoolAdmin && canSuperAdmin ? (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                navigate(mode === 'school' ? '/superadmin' : '/sekolah');
              }}
              className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-fg hover:bg-card-muted sm:hidden"
            >
              {mode === 'school' ? <ShieldCheck className="size-4" /> : <Building2 className="size-4" />}
              {mode === 'school' ? 'Mode Superadmin' : 'Mode Admin Sekolah'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              logout();
              navigate('/login', { replace: true });
            }}
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger hover:bg-card-muted"
          >
            <LogOut className="size-4" />
            Keluar
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function AppLayout({
  items,
  mode,
  subtitle,
  topbarExtra,
}: {
  items: NavItem[];
  mode: 'school' | 'super';
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
        <Sidebar items={items} subtitle={subtitle} />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-[#162534]/50" onClick={() => setMobileOpen(false)} aria-hidden />
          <div className="relative h-full w-64 max-w-[80%]">
            <Sidebar items={items} subtitle={subtitle} onNavigate={() => setMobileOpen(false)} />
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-2 top-5 rounded-md p-1 text-white/80 hover:bg-white/10"
              aria-label="Tutup menu"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>
      ) : null}

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
            {mode === 'school' ? <SchoolSwitcher /> : topbarExtra}
          </div>
          <ModeSwitch mode={mode} />
          <button
            type="button"
            onClick={toggleTheme}
            className="rounded-md p-2 text-fg-muted hover:bg-card-muted"
            aria-label={theme === 'dark' ? 'Mode terang' : 'Mode gelap'}
            title={theme === 'dark' ? 'Mode terang' : 'Mode gelap'}
          >
            {theme === 'dark' ? <Sun className="size-4.5" /> : <Moon className="size-4.5" />}
          </button>
          <UserMenu mode={mode} />
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

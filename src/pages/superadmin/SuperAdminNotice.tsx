import { ShieldAlert } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';

/** Banner ketika menu Superadmin tampil lewat mode preview tanpa role super_admin di JWT. */
export function SuperAdminNotice() {
  const { hasSuperAdminRole } = useAuth();
  if (hasSuperAdminRole) return null;
  return (
    <div className="mb-5 flex items-start gap-2 rounded-xl border border-warning/40 bg-[#FFF6E6] px-4 py-3 text-xs text-[#7a5410] dark:bg-warning/10 dark:text-[#f0c774]">
      <ShieldAlert className="mt-0.5 size-4 shrink-0" />
      <p>
        Mode pratinjau: token Anda belum memuat role <code>super_admin</code> (VITE_ENABLE_SUPERADMIN_PREVIEW=true).
        Permintaan data kemungkinan ditolak Hasura sampai backend menerapkan <code>docs/superadmin_backend.md</code>.
      </p>
    </div>
  );
}

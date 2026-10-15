import { Link } from 'react-router';
import { useSchoolScope } from '@/scope/SchoolScope';
import {
  useClasses,
  useImmunizationRecords,
  useImmunizationSessions,
  useMeasurementRecords,
  useMeasurementSessions,
} from '@/hooks/useSchoolData';
import type { MembershipRow } from '@/api/types';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';
import { isConnectedMembershipStatus, roleLabel } from '@/lib/roles';
import { Badge, SessionStatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Skeleton } from '@/components/ui/Skeleton';

/**
 * Detail anggota sekolah (guru/admin): profil keanggotaan + aktivitas pencatatan
 * (sesi yang dibuat, record yang dicatat). Semua dari cache data sekolah, tanpa query baru.
 */
export function TeacherDetailDrawer({ open, member, onClose }: { open: boolean; member: MembershipRow | null; onClose: () => void }) {
  const { basePath } = useSchoolScope();
  const classes = useClasses();
  const mSessions = useMeasurementSessions();
  const iSessions = useImmunizationSessions();
  const mRecords = useMeasurementRecords();
  const iRecords = useImmunizationRecords();

  if (!member) return <Drawer open={false} title="" onClose={onClose}>{null}</Drawer>;

  const userId = member.user_id;
  const className = new Map((classes.data ?? []).map(item => [item.id, item.name]));
  const sessions = [
    ...(mSessions.data ?? []).map(item => ({ ...item, kind: 'measurement' as const })),
    ...(iSessions.data ?? []).map(item => ({ ...item, kind: 'immunization' as const })),
  ]
    .filter(item => item.created_by === userId)
    .sort((a, b) => b.session_date.localeCompare(a.session_date));
  const measured = (mRecords.data ?? []).filter(item => item.recorded_by === userId);
  const immunized = (iRecords.data ?? []).filter(item => item.recorded_by === userId);
  const lastActivity = [...measured.map(item => item.measured_at), ...immunized.map(item => item.administered_at)].sort().at(-1) ?? null;
  const loading = mSessions.isLoading || iSessions.isLoading || mRecords.isLoading || iRecords.isLoading;
  const enabled = isConnectedMembershipStatus(member.status ?? 'active');

  return (
    <Drawer
      open={open}
      size="lg"
      title={member.user?.full_name ?? member.user?.email ?? 'Anggota'}
      description={
        <span className="inline-flex flex-wrap items-center gap-1.5">
          {member.user?.email ?? member.user_id}
          <Badge tone="neutral">{roleLabel(member.role)}</Badge>
          {enabled ? <Badge tone="success">Aktif</Badge> : <Badge tone="warning">Nonaktif</Badge>}
        </span>
      }
      onClose={onClose}
      footer={
        <Button variant="secondary" size="sm" onClick={onClose}>
          Tutup
        </Button>
      }
    >
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ['Bergabung', formatDate(member.joined_at ?? member.created_at)],
          ['Sesi dibuat', loading ? '…' : formatNumber(sessions.length)],
          ['Pengukuran dicatat', loading ? '…' : formatNumber(measured.length)],
          ['Imunisasi dicatat', loading ? '…' : formatNumber(immunized.length)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-line bg-card-muted/40 px-3 py-2">
            <dt className="text-xs text-fg-subtle">{label}</dt>
            <dd className="mt-0.5 font-semibold tabular-nums text-fg">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-fg-subtle">Aktivitas pencatatan terakhir: {formatDateTime(lastActivity)}</p>

      <section className="mt-6">
        <h3 className="mb-2 text-sm font-semibold text-fg">Sesi yang dibuat ({sessions.length})</h3>
        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : sessions.length === 0 ? (
          <p className="text-sm text-fg-subtle">Belum membuat sesi.</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {sessions.slice(0, 20).map(item => (
              <li key={`${item.kind}-${item.id}`}>
                <Link
                  to={`${basePath}/${item.kind === 'measurement' ? 'pengukuran' : 'imunisasi'}/${item.id}`}
                  onClick={onClose}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-sm transition-colors hover:bg-brand-50/60 dark:hover:bg-brand-900/20"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-fg">{item.name}</span>
                    <span className="text-xs text-fg-subtle">
                      {item.kind === 'measurement' ? 'Pengukuran' : 'Imunisasi'} · {className.get(item.class_id) ?? '-'} · {formatDate(item.session_date)}
                    </span>
                  </span>
                  <SessionStatusBadge status={item.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
        {sessions.length > 20 ? <p className="mt-1 text-xs text-fg-subtle">Menampilkan 20 sesi terbaru.</p> : null}
      </section>
    </Drawer>
  );
}

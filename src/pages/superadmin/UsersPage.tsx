import { useState } from 'react';
import { Link } from 'react-router';
import { Download } from 'lucide-react';
import type { AuthUserRow } from '@/api/types';
import { formatDate, initials } from '@/lib/format';
import { downloadCsv } from '@/lib/csv';
import { normalizeRoleKey, roleLabel } from '@/lib/roles';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, FilterSelect, type Column } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { QueryBoundary } from '@/components/ui/States';
import { useUsers } from './useSuperAdmin';
import { SuperAdminNotice } from './SuperAdminNotice';

function authRoleCodes(user: AuthUserRow): string[] {
  return user.user_roles.map(item => item.role?.code).filter((code): code is string => Boolean(code));
}

export function UsersPage() {
  const users = useUsers();
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const rows = (users.data ?? []).filter(user => {
    if (roleFilter) {
      const roles = [...authRoleCodes(user), ...user.school_memberships.map(item => item.role)].map(normalizeRoleKey);
      if (!roles.includes(roleFilter)) return false;
    }
    if (statusFilter === 'blocked' && !user.is_blocked) return false;
    if (statusFilter === 'unverified' && user.is_email_verified) return false;
    if (statusFilter === 'no-school' && user.school_memberships.length > 0) return false;
    return true;
  });

  const columns: Column<AuthUserRow>[] = [
    {
      key: 'name',
      header: 'Pengguna',
      sortValue: row => row.full_name ?? row.email ?? '',
      cell: row => (
        <div className="flex items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700 dark:bg-brand-900/60 dark:text-brand-300">
            {initials(row.full_name ?? row.email)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-fg">{row.full_name ?? '-'}</p>
            <p className="truncate text-xs text-fg-subtle">{row.email ?? '-'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'authRoles',
      header: 'Role auth',
      cell: row => (
        <div className="flex flex-wrap gap-1">
          {row.user_roles.length === 0
            ? '-'
            : row.user_roles.map((item, index) => (
                <Badge key={`${item.role?.code ?? 'role'}-${index}`} tone={item.is_default ? 'brand' : 'neutral'}>
                  {item.role?.code ?? '-'}
                </Badge>
              ))}
        </div>
      ),
    },
    {
      key: 'memberships',
      header: 'Membership sekolah',
      sortValue: row => row.school_memberships.length,
      cell: row =>
        row.school_memberships.length === 0 ? (
          <span className="text-fg-subtle">Belum terhubung</span>
        ) : (
          <ul className="flex flex-col gap-0.5 text-xs">
            {row.school_memberships.map(item => (
              <li key={item.id}>
                <Link
                  to={`/superadmin/sekolah/${item.school_id}`}
                  className="font-medium text-brand-600 hover:underline dark:text-brand-300"
                  onClick={event => event.stopPropagation()}
                >
                  {item.school?.name ?? item.school_id.slice(0, 8)}
                </Link>{' '}
                <span className="text-fg-subtle">
                  · {roleLabel(item.role)}
                  {item.status && item.status !== 'active' ? ` (${item.status})` : ''}
                </span>
              </li>
            ))}
          </ul>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: row => (
        <div className="flex flex-wrap gap-1">
          {row.is_blocked ? <Badge tone="danger">Diblokir</Badge> : <Badge tone="success">Aktif</Badge>}
          {!row.is_email_verified ? <Badge tone="warning">Email belum verifikasi</Badge> : null}
        </div>
      ),
    },
    { key: 'created', header: 'Terdaftar', sortValue: row => row.created_at, cell: row => formatDate(row.created_at) },
  ];

  const exportCsv = () =>
    downloadCsv('pengguna-mysimoka', rows, [
      { header: 'Nama', value: row => row.full_name },
      { header: 'Email', value: row => row.email },
      { header: 'Role Auth', value: row => authRoleCodes(row).join(' | ') },
      {
        header: 'Membership',
        value: row => row.school_memberships.map(item => `${item.school?.name ?? item.school_id}:${item.role}:${item.status ?? ''}`).join(' | '),
      },
      { header: 'Email Terverifikasi', value: row => (row.is_email_verified ? 'Ya' : 'Tidak') },
      { header: 'Diblokir', value: row => (row.is_blocked ? 'Ya' : 'Tidak') },
      { header: 'Terdaftar', value: row => row.created_at },
    ]);

  return (
    <div>
      <PageHeader title="Pengguna & Membership" description="Seluruh akun beserta role auth dan keanggotaan sekolah (read-only)." />
      <SuperAdminNotice />
      <Card>
        <QueryBoundary isLoading={users.isLoading} error={users.error} onRetry={() => void users.refetch()}>
          {() => (
            <DataTable
              rows={rows}
              columns={columns}
              getRowId={row => row.id}
              getSearchText={row =>
                `${row.full_name ?? ''} ${row.email ?? ''} ${row.school_memberships.map(item => item.school?.name ?? '').join(' ')}`
              }
              searchPlaceholder="Cari nama / email / sekolah"
              initialSort={{ key: 'created', dir: 'desc' }}
              initialPageSize={25}
              emptyTitle="Belum ada pengguna"
              filters={
                <>
                  <FilterSelect
                    label="Role"
                    value={roleFilter}
                    onChange={setRoleFilter}
                    options={[
                      { value: '', label: 'Semua role' },
                      { value: 'super_admin', label: 'Superadmin' },
                      { value: 'school_admin', label: 'Admin sekolah' },
                      { value: 'teacher', label: 'Guru' },
                      { value: 'user', label: 'Pengguna' },
                    ]}
                  />
                  <FilterSelect
                    label="Status"
                    value={statusFilter}
                    onChange={setStatusFilter}
                    options={[
                      { value: '', label: 'Semua status' },
                      { value: 'blocked', label: 'Diblokir' },
                      { value: 'unverified', label: 'Email belum verifikasi' },
                      { value: 'no-school', label: 'Belum terhubung sekolah' },
                    ]}
                  />
                </>
              }
              actions={
                <Button variant="secondary" size="sm" icon={<Download className="size-3.5" />} onClick={exportCsv}>
                  Ekspor CSV
                </Button>
              }
            />
          )}
        </QueryBoundary>
      </Card>
    </div>
  );
}

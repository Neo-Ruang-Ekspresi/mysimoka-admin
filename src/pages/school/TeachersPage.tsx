import { useMemo, useState } from 'react';
import { Copy, Download, KeyRound, PauseCircle, PlayCircle, ShieldCheck, UserMinus, UserPlus } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { useSchoolScope } from '@/scope/SchoolScope';
import { useSchoolMembers, useSchoolMutation, useSchoolProfile } from '@/hooks/useSchoolData';
import { useDrawerState } from '@/hooks/useCrud';
import {
  addTeacher,
  deleteMembership,
  MEMBER_ROLE_OPTIONS,
  setMembershipEnabled,
  updateMembership,
  type MemberRole,
} from '@/api/crud/teachers';
import { errorMessage } from '@/api/errors';
import type { MembershipRow } from '@/api/types';
import { formatDate, initials } from '@/lib/format';
import { downloadCsv, slugify } from '@/lib/csv';
import { isConnectedMembershipStatus, normalizeRoleKey, roleLabel } from '@/lib/roles';
import { Card, CardBody } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, FilterSelect, type Column } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Field, FormError, Input, Select } from '@/components/ui/Form';
import { QueryBoundary } from '@/components/ui/States';
import { RowActions } from '@/components/ui/RowActions';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';

const isEnabled = (row: MembershipRow) => isConnectedMembershipStatus(row.status ?? 'active');
const memberName = (row: MembershipRow) => row.user?.full_name ?? row.user?.email ?? 'Anggota';

export function TeachersPage() {
  const { schoolName, can } = useSchoolScope();
  const { userId } = useAuth();
  const canEdit = can.manageTeachers;
  const members = useSchoolMembers();
  const profile = useSchoolProfile();
  const toast = useToast();
  const confirm = useConfirm();
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const adder = useDrawerState<true>();
  const editor = useDrawerState<MembershipRow>();
  const toggle = useSchoolMutation((input: { id: string; enabled: boolean }, role) => setMembershipEnabled(input.id, input.enabled, role));
  const remove = useSchoolMutation((id: string, role) => deleteMembership(id, role));

  const rows = useMemo(
    () =>
      (members.data ?? []).filter(item => {
        if (roleFilter && normalizeRoleKey(item.role) !== roleFilter) return false;
        if (statusFilter === 'active' && !isEnabled(item)) return false;
        if (statusFilter === 'inactive' && isEnabled(item)) return false;
        return true;
      }),
    [members.data, roleFilter, statusFilter],
  );

  const askToggle = (row: MembershipRow) => {
    const enabled = isEnabled(row);
    void confirm({
      title: enabled ? `Nonaktifkan ${memberName(row)}?` : `Aktifkan kembali ${memberName(row)}?`,
      tone: enabled ? 'danger' : 'primary',
      confirmLabel: enabled ? 'Nonaktifkan' : 'Aktifkan',
      message: enabled
        ? 'Akses akun ini ke sekolah dicabut (tidak bisa melihat data atau mencatat). Data yang sudah dicatat tetap tersimpan dan akses bisa diaktifkan kembali.'
        : 'Akun ini akan kembali bisa mengakses data sekolah sesuai perannya.',
      onConfirm: async () => {
        await toggle.mutateAsync({ id: row.id, enabled: !enabled });
        toast.success(enabled ? 'Anggota dinonaktifkan.' : 'Anggota diaktifkan kembali.');
      },
    });
  };

  const askRemove = (row: MembershipRow) =>
    void confirm({
      title: `Keluarkan ${memberName(row)} dari sekolah?`,
      tone: 'danger',
      confirmLabel: 'Keluarkan',
      message:
        'Keanggotaan dihapus permanen. Akun pengguna tidak dihapus dan data yang pernah dicatat tetap ada. Untuk bergabung lagi, pengguna harus ditambahkan ulang atau memakai kode gabung.',
      onConfirm: async () => {
        await remove.mutateAsync(row.id);
        toast.success('Anggota dikeluarkan dari sekolah.');
      },
    });

  const columns: Column<MembershipRow>[] = [
    {
      key: 'name',
      header: 'Nama',
      sortValue: row => row.user?.full_name ?? '',
      cell: row => (
        <div className="flex items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700 dark:bg-brand-900/60 dark:text-brand-300">
            {initials(row.user?.full_name ?? row.user?.email)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-fg">
              {row.user?.full_name ?? '-'}
              {row.user_id === userId ? <span className="ml-1.5 text-xs font-normal text-fg-subtle">(Anda)</span> : null}
            </p>
            <p className="truncate text-xs text-fg-subtle">{row.user?.email ?? row.user_id}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Peran',
      sortValue: row => normalizeRoleKey(row.role),
      cell: row => <Badge tone={normalizeRoleKey(row.role) === 'school_admin' ? 'brand' : 'neutral'}>{roleLabel(row.role)}</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: row => row.status ?? '',
      cell: row =>
        isEnabled(row) ? <Badge tone="success">Aktif</Badge> : <Badge tone="warning">{row.status === 'inactive' ? 'Nonaktif' : row.status ?? '-'}</Badge>,
    },
    { key: 'joined', header: 'Bergabung', sortValue: row => row.joined_at ?? row.created_at, cell: row => formatDate(row.joined_at ?? row.created_at) },
    ...(!canEdit
      ? []
      : [
          {
            key: 'actions',
            header: '',
            className: 'w-12 text-right',
            cell: (row: MembershipRow) =>
              row.user_id === userId ? null : (
                <RowActions
                  actions={[
                    { label: 'Ubah peran', icon: <ShieldCheck className="size-4" />, onSelect: () => editor.show(row) },
                    isEnabled(row)
                      ? { label: 'Nonaktifkan', icon: <PauseCircle className="size-4" />, onSelect: () => askToggle(row) }
                      : { label: 'Aktifkan kembali', icon: <PlayCircle className="size-4" />, onSelect: () => askToggle(row) },
                    {
                      label: 'Keluarkan dari sekolah',
                      icon: <UserMinus className="size-4" />,
                      tone: 'danger' as const,
                      onSelect: () => askRemove(row),
                    },
                  ]}
                />
              ),
          },
        ]),
  ];

  const exportCsv = () =>
    downloadCsv(`guru-${slugify(schoolName)}`, rows, [
      { header: 'Nama', value: row => row.user?.full_name },
      { header: 'Email', value: row => row.user?.email },
      { header: 'Peran', value: row => roleLabel(row.role) },
      { header: 'Status', value: row => row.status },
      { header: 'Bergabung', value: row => row.joined_at ?? row.created_at },
    ]);

  const joinCode = profile.data?.join_code;
  const addButton = !canEdit ? null : (
    <Button icon={<UserPlus className="size-4" />} onClick={() => adder.show(true)}>
      Tambah guru
    </Button>
  );

  return (
    <div>
      <PageHeader title="Guru & Anggota" description="Guru dan admin yang terhubung ke sekolah." actions={addButton} />

      {canEdit ? (
        <Card className="mb-5">
          <CardBody className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="rounded-lg bg-brand-50 p-2 text-brand-500 dark:bg-brand-900/40">
                <KeyRound className="size-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-fg">Undang lewat kode gabung</p>
                <p className="text-xs text-fg-subtle">Guru dapat bergabung sendiri dari aplikasi mobile dengan memasukkan kode ini.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <code className="rounded-lg border border-line bg-card-muted px-3 py-1.5 font-mono text-base font-semibold tracking-[0.2em] text-fg">
                {profile.isLoading ? '…' : joinCode ?? '—'}
              </code>
              {joinCode ? (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Copy className="size-3.5" />}
                  onClick={() =>
                    navigator.clipboard
                      .writeText(joinCode)
                      .then(() => toast.success('Kode gabung disalin.'))
                      .catch(() => toast.error('Gagal menyalin kode.'))
                  }
                >
                  Salin
                </Button>
              ) : null}
            </div>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <QueryBoundary isLoading={members.isLoading} error={members.error} onRetry={() => void members.refetch()}>
          {() => (
            <DataTable
              rows={rows}
              columns={columns}
              getRowId={row => row.id}
              getSearchText={row => `${row.user?.full_name ?? ''} ${row.user?.email ?? ''}`}
              searchPlaceholder="Cari nama / email"
              initialSort={{ key: 'name', dir: 'asc' }}
              emptyTitle="Belum ada guru"
              emptyDescription={!canEdit ? undefined : 'Tambahkan guru atau bagikan kode gabung sekolah.'}
              emptyAction={addButton}
              filters={
                <>
                  <FilterSelect
                    label="Peran"
                    value={roleFilter}
                    onChange={setRoleFilter}
                    options={[
                      { value: '', label: 'Semua peran' },
                      { value: 'teacher', label: 'Guru' },
                      { value: 'school_admin', label: 'Admin sekolah' },
                      { value: 'user', label: 'Pengguna' },
                    ]}
                  />
                  <FilterSelect
                    label="Status"
                    value={statusFilter}
                    onChange={setStatusFilter}
                    options={[
                      { value: '', label: 'Semua status' },
                      { value: 'active', label: 'Aktif' },
                      { value: 'inactive', label: 'Nonaktif / menunggu' },
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
      <AddTeacherDrawer key={`add-${adder.key}`} open={adder.open} onClose={adder.close} />
      <EditMemberDrawer key={`edit-${editor.key}`} open={editor.open} member={editor.target} onClose={editor.close} />
    </div>
  );
}

function AddTeacherDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { schoolId } = useSchoolScope();
  const toast = useToast();
  const [form, setForm] = useState({ fullName: '', email: '', password: '' });
  const [errors, setErrors] = useState<{ fullName?: string; email?: string; password?: string; form?: string }>({});
  const mutation = useSchoolMutation((input: typeof form, role) => addTeacher({ ...input, schoolId }, role));

  const onSubmit = async () => {
    const next: typeof errors = {};
    if (!form.fullName.trim()) next.fullName = 'Nama guru wajib diisi.';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) next.email = 'Email tidak valid.';
    if (form.password && form.password.length < 6) next.password = 'Password minimal 6 karakter.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    try {
      await mutation.mutateAsync(form);
      toast.success('Guru ditambahkan ke sekolah.');
      onClose();
    } catch (submitError) {
      setErrors({ form: errorMessage(submitError) });
    }
  };

  return (
    <Drawer
      open={open}
      title="Tambah guru"
      description="Akun dibuat bila email belum terdaftar, lalu dihubungkan ke sekolah sebagai guru."
      onClose={onClose}
      onSubmit={() => void onSubmit()}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Batal
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Tambah
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormError message={errors.form} />
        <Field label="Nama lengkap *" error={errors.fullName}>
          {id => <Input id={id} value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} />}
        </Field>
        <Field label="Email *" error={errors.email}>
          {id => <Input id={id} type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />}
        </Field>
        <Field
          label="Password awal"
          error={errors.password}
          hint="Wajib (min. 6 karakter) jika email belum terdaftar. Diabaikan untuk akun yang sudah ada."
        >
          {id => (
            <Input
              id={id}
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
            />
          )}
        </Field>
      </div>
    </Drawer>
  );
}

function EditMemberDrawer({ open, member, onClose }: { open: boolean; member: MembershipRow | null; onClose: () => void }) {
  const toast = useToast();
  const currentRole = member ? normalizeRoleKey(member.role) : 'teacher';
  const [role, setRole] = useState<MemberRole>(currentRole === 'school_admin' ? 'school_admin' : 'teacher');
  const [enabled, setEnabled] = useState(member ? isEnabled(member) : true);
  const [error, setError] = useState<string | null>(null);
  const mutation = useSchoolMutation(async (_: void, hasuraRole) => {
    if (!member) return;
    await updateMembership(
      member.id,
      { role, ...(enabled ? { status: 'active' } : { status: 'inactive', isActive: false }) },
      hasuraRole,
    );
  });

  const onSubmit = async () => {
    setError(null);
    try {
      await mutation.mutateAsync();
      toast.success('Data anggota diperbarui.');
      onClose();
    } catch (submitError) {
      setError(errorMessage(submitError));
    }
  };

  return (
    <Drawer
      open={open}
      title="Ubah peran anggota"
      description={member ? `${memberName(member)} · ${member.user?.email ?? ''}` : undefined}
      onClose={onClose}
      onSubmit={() => void onSubmit()}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Batal
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Simpan
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormError message={error} />
        <Field
          label="Peran"
          hint={role === 'school_admin' ? 'Admin sekolah dapat mengelola kelas, siswa, guru, dan menghapus data.' : 'Guru dapat membuat sesi dan mencatat data.'}
        >
          {id => (
            <Select id={id} value={role} onChange={e => setRole(e.target.value as MemberRole)}>
              {MEMBER_ROLE_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <label className="flex items-start gap-2 text-sm text-fg">
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="mt-0.5 size-4 accent-brand-500" />
          <span>
            Akses aktif
            <span className="block text-xs text-fg-subtle">Matikan untuk mencabut akses tanpa mengeluarkan dari sekolah.</span>
          </span>
        </label>
      </div>
    </Drawer>
  );
}

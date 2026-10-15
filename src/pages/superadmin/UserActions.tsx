/** Drawer detail & aksi pengguna untuk Superadmin. */
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Ban, BadgeCheck, KeyRound, Pencil, Plus, ShieldCheck, ShieldOff, Trash2, Unlock } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import type { AuthUserRow } from '@/api/types';
import {
  addMembership,
  createUserAccount,
  deleteMembershipAsSuper,
  fetchUserExtras,
  grantSuperAdmin,
  resetUserPassword,
  revokeSuperAdmin,
  setEmailVerified,
  setUserBlocked,
  updateMembershipAsSuper,
  updateUserName,
  type MembershipRoleInput,
} from '@/api/superadminActions';
import { errorMessage } from '@/api/errors';
import { formatDate, formatDateTime } from '@/lib/format';
import { isConnectedMembershipStatus, normalizeRoleKey, roleLabel } from '@/lib/roles';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Modal } from '@/components/ui/Modal';
import { Field, FormError, Input, Select, Textarea } from '@/components/ui/Form';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { useSchoolsOverview } from './useSuperAdmin';
import { useSuperMutation } from './useSuperActions';

const MEMBER_ROLES: Array<{ value: MembershipRoleInput; label: string }> = [
  { value: 'teacher', label: 'Guru' },
  { value: 'school_admin', label: 'Admin sekolah' },
];

export function isSuperAdminUser(user: AuthUserRow): boolean {
  return user.user_roles.some(item => normalizeRoleKey(item.role?.code ?? item.role?.name ?? '') === 'super_admin');
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-6 first:mt-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-fg">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Buat pengguna
// ---------------------------------------------------------------------------

export function CreateUserDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const schools = useSchoolsOverview();
  const [form, setForm] = useState({ fullName: '', email: '', password: '', schoolId: '', role: 'teacher' as MembershipRoleInput });
  const [error, setError] = useState<string | null>(null);
  const mutation = useSuperMutation((input: typeof form) => createUserAccount({ ...input, schoolId: input.schoolId || null }));

  const onSubmit = async () => {
    setError(null);
    try {
      await mutation.mutateAsync(form);
      toast.success('Pengguna dibuat.', { description: form.email.trim().toLowerCase() });
      onClose();
    } catch (submitError) {
      setError(errorMessage(submitError));
    }
  };

  return (
    <Drawer
      open={open}
      title="Buat pengguna"
      description="Akun dibuat lewat auth service; pengguna bisa langsung login dengan password ini."
      onClose={onClose}
      onSubmit={() => void onSubmit()}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Batal
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Buat pengguna
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormError message={error} />
        <Field label="Nama lengkap">{id => <Input id={id} value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} />}</Field>
        <Field label="Email">{id => <Input id={id} type="email" autoComplete="off" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />}</Field>
        <Field label="Password awal" hint="Minimal 8 karakter. Minta pengguna menggantinya setelah login.">
          {id => <Input id={id} type="text" autoComplete="new-password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />}
        </Field>
        <Field label="Sekolah (opsional)">
          {id => (
            <Select id={id} value={form.schoolId} onChange={e => setForm({ ...form, schoolId: e.target.value })}>
              <option value="">Tanpa sekolah</option>
              {(schools.data?.schools ?? []).map(school => (
                <option key={school.id} value={school.id}>
                  {school.name ?? school.id.slice(0, 8)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {form.schoolId ? (
          <Field label="Peran di sekolah">
            {id => (
              <Select id={id} value={form.role} onChange={e => setForm({ ...form, role: e.target.value as MembershipRoleInput })}>
                {MEMBER_ROLES.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
      </div>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// Dialog kecil: blokir, reset password, ubah nama
// ---------------------------------------------------------------------------

function BlockDialog({ open, user, onClose }: { open: boolean; user: AuthUserRow; onClose: () => void }) {
  const toast = useToast();
  const blocking = !user.is_blocked;
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mutation = useSuperMutation((_: void) => setUserBlocked(user.id, blocking, reason));
  const submit = async () => {
    setError(null);
    try {
      await mutation.mutateAsync();
      toast.success(blocking ? 'Pengguna diblokir.' : 'Blokir dibuka.');
      onClose();
    } catch (submitError) {
      setError(errorMessage(submitError));
    }
  };
  return (
    <Modal
      open={open}
      title={blocking ? `Blokir ${user.full_name ?? user.email ?? 'pengguna'}?` : `Buka blokir ${user.full_name ?? user.email ?? 'pengguna'}?`}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Batal
          </Button>
          <Button variant={blocking ? 'danger' : 'primary'} loading={mutation.isPending} onClick={() => void submit()}>
            {blocking ? 'Blokir' : 'Buka blokir'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm text-fg-muted">
        <p>
          {blocking
            ? 'Pengguna tidak bisa login dan sesi aktifnya ditolak. Data yang pernah dicatat tetap ada.'
            : 'Pengguna bisa login kembali dengan password yang sama.'}
        </p>
        <FormError message={error} />
        {blocking ? (
          <Field label="Alasan (opsional)">{id => <Textarea id={id} value={reason} data-autofocus onChange={e => setReason(e.target.value)} />}</Field>
        ) : null}
      </div>
    </Modal>
  );
}

function ResetPasswordDialog({ open, user, onClose }: { open: boolean; user: AuthUserRow; onClose: () => void }) {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [confirmValue, setConfirmValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mutation = useSuperMutation((_: void) => resetUserPassword(user.id, password));
  const submit = async () => {
    setError(null);
    if (password.length < 8) return setError('Password minimal 8 karakter.');
    if (password !== confirmValue) return setError('Konfirmasi tidak sama.');
    try {
      await mutation.mutateAsync();
      toast.success('Password direset.', { description: 'Sampaikan password baru ke pengguna secara aman.' });
      onClose();
    } catch (submitError) {
      setError(errorMessage(submitError));
    }
  };
  return (
    <Modal
      open={open}
      title={`Reset password ${user.full_name ?? user.email ?? ''}`}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Batal
          </Button>
          <Button loading={mutation.isPending} onClick={() => void submit()}>
            Reset password
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <FormError message={error} />
        <Field label="Password baru" hint="Minimal 8 karakter.">
          {id => <Input id={id} type="text" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} />}
        </Field>
        <Field label="Konfirmasi">
          {id => <Input id={id} type="text" autoComplete="new-password" value={confirmValue} onChange={e => setConfirmValue(e.target.value)} />}
        </Field>
      </div>
    </Modal>
  );
}

function RenameDialog({ open, user, onClose }: { open: boolean; user: AuthUserRow; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(user.full_name ?? '');
  const [error, setError] = useState<string | null>(null);
  const mutation = useSuperMutation((value: string, role) => updateUserName(user.id, value, role));
  const submit = async () => {
    setError(null);
    try {
      await mutation.mutateAsync(name);
      toast.success('Nama diperbarui.');
      onClose();
    } catch (submitError) {
      setError(errorMessage(submitError));
    }
  };
  return (
    <Modal
      open={open}
      title="Ubah nama"
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Batal
          </Button>
          <Button loading={mutation.isPending} onClick={() => void submit()}>
            Simpan
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <FormError message={error} />
        <Field label="Nama lengkap">{id => <Input id={id} value={name} onChange={e => setName(e.target.value)} />}</Field>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Detail pengguna
// ---------------------------------------------------------------------------

type Dialog = { kind: 'block' | 'password' | 'rename'; key: number } | null;

export function UserDetailDrawer({ open, user, onClose }: { open: boolean; user: AuthUserRow | null; onClose: () => void }) {
  const { userId: selfId, superAdminRole } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const schools = useSchoolsOverview();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [newSchool, setNewSchool] = useState('');
  const [newRole, setNewRole] = useState<MembershipRoleInput>('teacher');
  const extras = useQuery({
    queryKey: ['super', superAdminRole, 'user-extras', user?.id ?? ''],
    queryFn: () => fetchUserExtras(user!.id, superAdminRole),
    enabled: open && !!user,
  });
  const verify = useSuperMutation((input: { id: string; verified: boolean }, role) => setEmailVerified(input.id, input.verified, role));
  const grant = useSuperMutation((id: string, role) => grantSuperAdmin(id, role));
  const revoke = useSuperMutation((id: string, role) => revokeSuperAdmin(id, role));
  const add = useSuperMutation((input: { userId: string; schoolId: string; role: MembershipRoleInput }, role) => addMembership(input, role));
  const update = useSuperMutation((input: { id: string; role?: MembershipRoleInput; enabled?: boolean }, role) =>
    updateMembershipAsSuper(input.id, input, role),
  );
  const remove = useSuperMutation((id: string, role) => deleteMembershipAsSuper(id, role));

  if (!user) return <Drawer open={false} title="" onClose={onClose}>{null}</Drawer>;

  const isSelf = user.id === selfId;
  const isSuper = isSuperAdminUser(user);
  const memberSchoolIds = new Set(user.school_memberships.map(item => item.school_id));
  const availableSchools = (schools.data?.schools ?? []).filter(school => !memberSchoolIds.has(school.id));
  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      toast.success(success);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  const open_ = (kind: NonNullable<Dialog>['kind']) => setDialog(current => ({ kind, key: (current?.key ?? 0) + 1 }));

  return (
    <>
      <Drawer
        open={open}
        size="lg"
        title={user.full_name ?? user.email ?? 'Pengguna'}
        description={
          <span className="inline-flex flex-wrap items-center gap-1.5">
            {user.email ?? user.id}
            {isSelf ? <Badge tone="brand">Anda</Badge> : null}
            {user.is_blocked ? <Badge tone="danger">Diblokir</Badge> : <Badge tone="success">Aktif</Badge>}
            {!user.is_email_verified ? <Badge tone="warning">Email belum verifikasi</Badge> : null}
          </span>
        }
        onClose={onClose}
        footer={
          <div className="flex w-full flex-wrap items-center justify-end gap-2">
            <Button variant="secondary" size="sm" icon={<KeyRound className="size-3.5" />} onClick={() => open_('password')}>
              Reset password
            </Button>
            {!isSelf ? (
              <Button
                variant={user.is_blocked ? 'secondary' : 'danger'}
                size="sm"
                icon={user.is_blocked ? <Unlock className="size-3.5" /> : <Ban className="size-3.5" />}
                onClick={() => open_('block')}
              >
                {user.is_blocked ? 'Buka blokir' : 'Blokir'}
              </Button>
            ) : null}
          </div>
        }
      >
        <Section
          title="Profil"
          action={
            <Button variant="ghost" size="sm" icon={<Pencil className="size-3.5" />} onClick={() => open_('rename')}>
              Ubah nama
            </Button>
          }
        >
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-fg-subtle">Nama</dt>
              <dd className="break-words text-fg">{user.full_name ?? '-'}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-fg-subtle">Email</dt>
              <dd className="break-words text-fg">{user.email ?? '-'}</dd>
            </div>
            <div>
              <dt className="text-xs text-fg-subtle">Terdaftar</dt>
              <dd className="text-fg">{formatDate(user.created_at)}</dd>
            </div>
            <div>
              <dt className="text-xs text-fg-subtle">Verifikasi email</dt>
              <dd className="flex flex-wrap items-center gap-2 text-fg">
                {user.is_email_verified ? 'Terverifikasi' : 'Belum'}
                <button
                  type="button"
                  className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-300"
                  onClick={() =>
                    void run(
                      () => verify.mutateAsync({ id: user.id, verified: !user.is_email_verified }),
                      user.is_email_verified ? 'Verifikasi email dibatalkan.' : 'Email ditandai terverifikasi.',
                    )
                  }
                >
                  {user.is_email_verified ? 'Batalkan' : 'Tandai terverifikasi'}
                </button>
              </dd>
            </div>
            {user.is_blocked ? (
              <div className="col-span-2">
                <dt className="text-xs text-fg-subtle">Diblokir</dt>
                <dd className="text-fg">
                  {formatDateTime(extras.data?.blocked_at ?? null)}
                  {extras.data?.blocked_reason ? <span className="block text-xs text-fg-muted">Alasan: {extras.data.blocked_reason}</span> : null}
                </dd>
              </div>
            ) : null}
          </dl>
        </Section>

        <Section title="Role auth">
          <div className="flex flex-wrap items-center gap-1.5">
            {user.user_roles.length === 0 ? <span className="text-sm text-fg-subtle">Tidak ada role.</span> : null}
            {user.user_roles.map((item, index) => (
              <Badge key={`${item.role?.code ?? 'role'}-${index}`} tone={item.is_default ? 'brand' : 'neutral'}>
                {item.role?.name ?? item.role?.code ?? '-'}
                {item.is_default ? ' (default)' : ''}
              </Badge>
            ))}
          </div>
          <div className="mt-2">
            {!isSuper ? (
              <Button
                variant="secondary"
                size="sm"
                icon={<ShieldCheck className="size-3.5" />}
                loading={grant.isPending}
                onClick={() =>
                  void confirm({
                    title: `Jadikan ${user.full_name ?? user.email} superadmin?`,
                    tone: 'danger',
                    confirmLabel: 'Jadikan superadmin',
                    message: 'Pengguna mendapat akses penuh ke SEMUA sekolah dan pengguna. Berlaku setelah pengguna login ulang.',
                    onConfirm: () => grant.mutateAsync(user.id).then(() => toast.success('Role superadmin diberikan.')),
                  })
                }
              >
                Jadikan superadmin
              </Button>
            ) : !isSelf ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-danger"
                icon={<ShieldOff className="size-3.5" />}
                loading={revoke.isPending}
                onClick={() =>
                  void confirm({
                    title: `Cabut superadmin dari ${user.full_name ?? user.email}?`,
                    tone: 'danger',
                    confirmLabel: 'Cabut',
                    message: 'Akses lintas sekolah dicabut setelah token pengguna diperbarui. Keanggotaan sekolah tidak berubah.',
                    onConfirm: () => revoke.mutateAsync(user.id).then(() => toast.success('Role superadmin dicabut.')),
                  })
                }
              >
                Cabut superadmin
              </Button>
            ) : (
              <p className="text-xs text-fg-subtle">Role superadmin milik sendiri tidak bisa dicabut dari sini.</p>
            )}
          </div>
        </Section>

        <Section title={`Keanggotaan sekolah (${user.school_memberships.length})`}>
          {user.school_memberships.length === 0 ? (
            <p className="text-sm text-fg-subtle">Belum terhubung ke sekolah.</p>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {user.school_memberships.map(item => {
                const enabled = isConnectedMembershipStatus(item.status ?? 'active');
                const memberRole = normalizeRoleKey(item.role) === 'school_admin' ? 'school_admin' : 'teacher';
                return (
                  <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0">
                      <Link to={`/superadmin/sekolah/${item.school_id}`} onClick={onClose} className="font-medium text-brand-600 hover:underline dark:text-brand-300">
                        {item.school?.name ?? item.school_id.slice(0, 8)}
                      </Link>
                      <span className="block text-xs text-fg-subtle">
                        {roleLabel(item.role)}
                        {!enabled ? ` · ${item.status ?? 'nonaktif'}` : ''}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <Select
                        aria-label="Peran"
                        className="h-8 w-36 text-xs"
                        value={memberRole}
                        onChange={e => void run(() => update.mutateAsync({ id: item.id, role: e.target.value as MembershipRoleInput }), 'Peran diperbarui.')}
                      >
                        {MEMBER_ROLES.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void run(() => update.mutateAsync({ id: item.id, enabled: !enabled }), enabled ? 'Keanggotaan dinonaktifkan.' : 'Keanggotaan diaktifkan.')}
                      >
                        {enabled ? 'Nonaktifkan' : 'Aktifkan'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-danger"
                        aria-label="Hapus keanggotaan"
                        icon={<Trash2 className="size-3.5" />}
                        onClick={() =>
                          void confirm({
                            title: `Keluarkan dari ${item.school?.name ?? 'sekolah'}?`,
                            tone: 'danger',
                            confirmLabel: 'Keluarkan',
                            message: 'Keanggotaan dihapus. Akun pengguna dan data yang pernah dicatat tetap ada.',
                            onConfirm: () => remove.mutateAsync(item.id).then(() => toast.success('Keanggotaan dihapus.')),
                          })
                        }
                      />
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-line p-3">
            <Field label="Tambah ke sekolah" className="min-w-48 flex-1">
              {id => (
                <Select id={id} value={newSchool} onChange={e => setNewSchool(e.target.value)}>
                  <option value="">Pilih sekolah…</option>
                  {availableSchools.map(school => (
                    <option key={school.id} value={school.id}>
                      {school.name ?? school.id.slice(0, 8)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Peran" className="w-40">
              {id => (
                <Select id={id} value={newRole} onChange={e => setNewRole(e.target.value as MembershipRoleInput)}>
                  {MEMBER_ROLES.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Button
              size="md"
              icon={<Plus className="size-4" />}
              disabled={!newSchool}
              loading={add.isPending}
              onClick={() =>
                void run(async () => {
                  await add.mutateAsync({ userId: user.id, schoolId: newSchool, role: newRole });
                  setNewSchool('');
                }, 'Keanggotaan ditambahkan.')
              }
            >
              Tambah
            </Button>
          </div>
        </Section>
        {user.is_email_verified ? null : (
          <p className="mt-4 flex items-center gap-1.5 text-xs text-fg-subtle">
            <BadgeCheck className="size-3.5" aria-hidden /> Pengguna dengan email belum terverifikasi mungkin tidak bisa login, tergantung pengaturan auth.
          </p>
        )}
      </Drawer>
      {dialog?.kind === 'block' ? <BlockDialog key={dialog.key} open user={user} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === 'password' ? <ResetPasswordDialog key={dialog.key} open user={user} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === 'rename' ? <RenameDialog key={dialog.key} open user={user} onClose={() => setDialog(null)} /> : null}
    </>
  );
}

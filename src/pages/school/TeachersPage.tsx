import { useState, type FormEvent } from 'react';
import { Copy, Download, KeyRound, UserPlus } from 'lucide-react';
import { useSchoolScope } from '@/scope/SchoolScope';
import { useSchoolMembers, useSchoolMutation, useSchoolProfile } from '@/hooks/useSchoolData';
import { addTeacher } from '@/api/school';
import { errorMessage } from '@/api/errors';
import type { MembershipRow } from '@/api/types';
import { formatDate, initials } from '@/lib/format';
import { downloadCsv, slugify } from '@/lib/csv';
import { normalizeRoleKey, roleLabel } from '@/lib/roles';
import { Card, CardBody } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, FilterSelect, type Column } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Field, FormError, Input } from '@/components/ui/Form';
import { QueryBoundary } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';

export function TeachersPage() {
  const { schoolName, can } = useSchoolScope();
  const canEdit = can.manageTeachers;
  const members = useSchoolMembers();
  const profile = useSchoolProfile();
  const toast = useToast();
  const [roleFilter, setRoleFilter] = useState('teacher');
  const [adding, setAdding] = useState(false);

  const rows = (members.data ?? []).filter(item => !roleFilter || normalizeRoleKey(item.role) === roleFilter);

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
            <p className="truncate font-medium text-fg">{row.user?.full_name ?? '-'}</p>
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
      cell: row => <Badge tone={row.status === 'active' ? 'success' : 'warning'}>{row.status === 'active' ? 'Aktif' : row.status ?? '-'}</Badge>,
    },
    { key: 'joined', header: 'Bergabung', sortValue: row => row.joined_at ?? row.created_at, cell: row => formatDate(row.joined_at ?? row.created_at) },
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

  return (
    <div>
      <PageHeader
        title="Guru & Anggota"
        description="Guru dan admin yang terhubung ke sekolah."
        actions={
          !canEdit ? null : (
            <Button icon={<UserPlus className="size-4" />} onClick={() => setAdding(true)}>
              Tambah guru
            </Button>
          )
        }
      />

      {canEdit ? (
        <Card className="mb-5">
          <CardBody className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="rounded-lg bg-brand-50 p-2 text-brand-500 dark:bg-brand-900/40">
                <KeyRound className="size-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-fg">Undang lewat kode gabung</p>
                <p className="text-xs text-fg-subtle">
                  Guru dapat bergabung sendiri dari aplikasi mobile dengan memasukkan kode ini.
                </p>
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
              filters={
                <FilterSelect
                  label="Peran"
                  value={roleFilter}
                  onChange={setRoleFilter}
                  options={[
                    { value: 'teacher', label: 'Guru' },
                    { value: 'school_admin', label: 'Admin sekolah' },
                    { value: 'user', label: 'Pengguna' },
                    { value: '', label: 'Semua peran' },
                  ]}
                />
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
      {adding ? <AddTeacherModal onClose={() => setAdding(false)} /> : null}
    </div>
  );
}

function AddTeacherModal({ onClose }: { onClose: () => void }) {
  const { schoolId } = useSchoolScope();
  const toast = useToast();
  const [form, setForm] = useState({ fullName: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const mutation = useSchoolMutation((input: typeof form, role) => addTeacher({ ...input, schoolId }, role));

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!form.fullName.trim()) return setError('Nama guru wajib diisi.');
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return setError('Email tidak valid.');
    try {
      await mutation.mutateAsync(form);
      toast.success('Guru ditambahkan ke sekolah.');
      onClose();
    } catch (submitError) {
      setError(errorMessage(submitError));
    }
  };

  return (
    <Modal
      open
      title="Tambah guru"
      description="Sama seperti aplikasi mobile: akun dibuat bila email belum terdaftar, lalu dihubungkan ke sekolah sebagai guru."
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Batal
          </Button>
          <Button type="submit" form="teacher-form" loading={mutation.isPending}>
            Tambah
          </Button>
        </>
      }
    >
      <form id="teacher-form" onSubmit={onSubmit} className="flex flex-col gap-4">
        <FormError message={error} />
        <Field label="Nama lengkap *">
          {id => <Input id={id} value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} />}
        </Field>
        <Field label="Email *">
          {id => (
            <Input id={id} type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          )}
        </Field>
        <Field label="Password awal" hint="Wajib (min. 6 karakter) jika email belum terdaftar. Diabaikan untuk akun yang sudah ada.">
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
      </form>
    </Modal>
  );
}

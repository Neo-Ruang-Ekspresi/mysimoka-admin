/** Drawer & dialog aksi sekolah untuk Superadmin (buat/ubah, hapus dengan konfirmasi kuat, detail). */
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, Copy, ExternalLink, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import type { SchoolOverviewRow } from '@/api/superadmin';
import { createSchool, deleteSchool, regenerateSchoolJoinCode, updateSchool } from '@/api/superadminActions';
import { errorMessage } from '@/api/errors';
import { formatDate, formatNumber } from '@/lib/format';
import { isConnectedMembershipStatus, roleLabel } from '@/lib/roles';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Modal } from '@/components/ui/Modal';
import { Field, FormError, Input, Textarea } from '@/components/ui/Form';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { useUsers } from './useSuperAdmin';
import { useSuperMutation } from './useSuperActions';

export type SchoolSummary = SchoolOverviewRow & {
  classCount: number;
  studentCount: number;
  teacherCount: number;
  adminCount: number;
  measurementSessions: number;
  immunizationSessions: number;
  lastActivity: string | null;
};

export function SchoolFormDrawer({ open, school, onClose }: { open: boolean; school: SchoolOverviewRow | null; onClose: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: school?.name ?? '', number: school?.number ?? '', address: school?.address ?? '' });
  const [error, setError] = useState<string | null>(null);
  const mutation = useSuperMutation((input: typeof form, role) =>
    school ? updateSchool(school.id, input, role) : createSchool(input, role).then(() => undefined),
  );

  const onSubmit = async () => {
    setError(null);
    try {
      await mutation.mutateAsync(form);
      toast.success(school ? 'Sekolah diperbarui.' : 'Sekolah dibuat.', school ? undefined : { description: 'Kode gabung dibuat otomatis.' });
      onClose();
    } catch (submitError) {
      setError(errorMessage(submitError));
    }
  };

  return (
    <Drawer
      open={open}
      title={school ? 'Ubah sekolah' : 'Tambah sekolah'}
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
        <Field label="Nama sekolah">{id => <Input id={id} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />}</Field>
        <Field label="NPSN" hint="Opsional.">
          {id => <Input id={id} value={form.number} inputMode="numeric" onChange={e => setForm({ ...form, number: e.target.value })} />}
        </Field>
        <Field label="Alamat">{id => <Textarea id={id} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />}</Field>
      </div>
    </Drawer>
  );
}

/** Hapus sekolah: wajib mengetik nama sekolah persis. */
export function DeleteSchoolDialog({ open, school, onClose, onDeleted }: { open: boolean; school: SchoolSummary | null; onClose: () => void; onDeleted?: () => void }) {
  const toast = useToast();
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mutation = useSuperMutation((id: string, role) => deleteSchool(id, role));
  const name = school?.name?.trim() ?? '';
  const matches = name.length > 0 && typed.trim() === name;

  const submit = async () => {
    if (!school || !matches) return;
    setError(null);
    try {
      await mutation.mutateAsync(school.id);
      toast.success(`Sekolah ${name} dihapus.`);
      onDeleted?.();
      onClose();
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    }
  };

  return (
    <Modal
      open={open}
      title="Hapus sekolah permanen?"
      onClose={() => (mutation.isPending ? undefined : onClose())}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Batal
          </Button>
          <Button variant="danger" disabled={!matches} loading={mutation.isPending} onClick={() => void submit()}>
            Hapus sekolah
          </Button>
        </>
      }
    >
      {school ? (
        <div className="flex flex-col gap-4 text-sm">
          <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-[#FDEEEE] px-3 py-2 text-[#B42318] dark:bg-danger/15 dark:text-[#f59a9a]">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              <b>{name}</b> beserta data terkait ikut terhapus (cascade): {formatNumber(school.classCount)} kelas,{' '}
              {formatNumber(school.studentCount)} siswa aktif terdaftar, {formatNumber(school.measurementSessions + school.immunizationSessions)} sesi
              beserta record pengukuran/imunisasi, keanggotaan guru/admin, dan perangkat sekolah. Akun pengguna tidak dihapus.
              Tindakan ini tidak bisa dibatalkan. Bila server menolak karena data masih terkait, tidak ada yang terhapus.
            </p>
          </div>
          <FormError message={error} />
          <Field label={`Ketik nama sekolah "${name}" untuk konfirmasi`}>
            {id => <Input id={id} value={typed} autoComplete="off" data-autofocus onChange={e => setTyped(e.target.value)} />}
          </Field>
        </div>
      ) : null}
    </Modal>
  );
}

/** Detail sekolah: profil, statistik, kode gabung, anggota. */
export function SchoolDetailDrawer({
  open,
  school,
  onClose,
  onEdit,
  onDelete,
}: {
  open: boolean;
  school: SchoolSummary | null;
  onClose: () => void;
  onEdit: (school: SchoolSummary) => void;
  onDelete: (school: SchoolSummary) => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const users = useUsers();
  const regenerate = useSuperMutation((id: string, role) => regenerateSchoolJoinCode(id, role));
  const members = useMemo(() => {
    if (!school) return [];
    return (users.data ?? []).flatMap(user =>
      user.school_memberships
        .filter(item => item.school_id === school.id)
        .map(item => ({ ...item, name: user.full_name ?? user.email ?? user.id.slice(0, 8), email: user.email })),
    );
  }, [users.data, school]);

  if (!school) return <Drawer open={false} title="" onClose={onClose}>{null}</Drawer>;

  const copy = (code: string) =>
    navigator.clipboard
      .writeText(code)
      .then(() => toast.success('Kode gabung disalin.'))
      .catch(() => toast.error('Gagal menyalin kode.'));

  const askRegenerate = () =>
    void confirm({
      title: 'Buat ulang kode gabung?',
      tone: 'danger',
      confirmLabel: 'Buat ulang',
      message: 'Kode lama langsung tidak berlaku. Guru yang belum bergabung harus memakai kode baru.',
      onConfirm: async () => {
        const code = await regenerate.mutateAsync(school.id);
        toast.success('Kode gabung baru dibuat.', { description: code });
      },
    });

  return (
    <Drawer
      open={open}
      size="lg"
      title={school.name ?? 'Sekolah'}
      description={`${school.number ? `NPSN ${school.number} · ` : ''}terdaftar ${formatDate(school.created_at)}`}
      onClose={onClose}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" size="sm" className="text-danger" icon={<Trash2 className="size-3.5" />} onClick={() => onDelete(school)}>
            Hapus
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" icon={<Pencil className="size-3.5" />} onClick={() => onEdit(school)}>
              Ubah
            </Button>
            <Link
              to={`/superadmin/sekolah/${school.id}`}
              onClick={onClose}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand-500 px-3 text-xs font-medium text-white shadow-sm hover:bg-brand-600"
            >
              <ExternalLink className="size-3.5" /> Buka dashboard sekolah
            </Link>
          </div>
        </div>
      }
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
        <div className="col-span-2 sm:col-span-3">
          <dt className="text-xs text-fg-subtle">Alamat</dt>
          <dd className="whitespace-pre-line text-fg">{school.address ?? '-'}</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-subtle">Dibuat oleh</dt>
          <dd className="break-words text-fg">{school.user?.full_name ?? school.user?.email ?? '-'}</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-subtle">Aktivitas terakhir</dt>
          <dd className="text-fg">{formatDate(school.lastActivity)}</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-subtle">Diperbarui</dt>
          <dd className="text-fg">{formatDate(school.updated_at)}</dd>
        </div>
      </dl>

      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ['Siswa aktif', school.studentCount],
          ['Kelas', school.classCount],
          ['Guru / admin', `${school.teacherCount} / ${school.adminCount}`],
          ['Sesi ukur / imun', `${school.measurementSessions} / ${school.immunizationSessions}`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-line bg-card-muted/40 px-3 py-2">
            <dt className="text-xs text-fg-subtle">{label}</dt>
            <dd className="mt-0.5 font-semibold tabular-nums text-fg">{typeof value === 'number' ? formatNumber(value) : value}</dd>
          </div>
        ))}
      </dl>

      <section className="mt-6">
        <h3 className="mb-2 text-sm font-semibold text-fg">Kode gabung</h3>
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2">
          <code className="text-base font-semibold tracking-widest text-fg">{school.join_code ?? '-'}</code>
          <div className="ml-auto flex gap-2">
            {school.join_code ? (
              <Button variant="secondary" size="sm" icon={<Copy className="size-3.5" />} onClick={() => copy(school.join_code!)}>
                Salin
              </Button>
            ) : null}
            <Button variant="secondary" size="sm" icon={<RefreshCw className="size-3.5" />} loading={regenerate.isPending} onClick={askRegenerate}>
              Buat ulang
            </Button>
          </div>
        </div>
      </section>

      <section className="mt-6">
        <h3 className="mb-2 text-sm font-semibold text-fg">Anggota ({members.length || school.school_memberships.length})</h3>
        {members.length === 0 ? (
          <p className="text-sm text-fg-subtle">
            {users.isLoading ? 'Memuat anggota…' : school.school_memberships.length === 0 ? 'Belum ada anggota.' : 'Nama anggota tidak tersedia.'}
          </p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {members.map(item => (
              <li key={item.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-fg">{item.name}</span>
                  {item.email ? <span className="block truncate text-xs text-fg-subtle">{item.email}</span> : null}
                </span>
                <span className="flex shrink-0 gap-1">
                  <Badge tone={item.role === 'school_admin' ? 'brand' : 'neutral'}>{roleLabel(item.role)}</Badge>
                  {!isConnectedMembershipStatus(item.status ?? 'active') ? <Badge tone="warning">{item.status ?? 'nonaktif'}</Badge> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-xs text-fg-subtle">Kelola anggota dari tab Guru di dashboard sekolah atau dari halaman Pengguna.</p>
      </section>
    </Drawer>
  );
}

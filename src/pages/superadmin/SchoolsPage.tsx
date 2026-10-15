import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Copy, Download, ExternalLink, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { regenerateSchoolJoinCode } from '@/api/superadminActions';
import { useDrawerState } from '@/hooks/useCrud';
import { RowActions } from '@/components/ui/RowActions';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { formatDate, formatNumber } from '@/lib/format';
import { downloadCsv } from '@/lib/csv';
import { isConnectedMembershipStatus, normalizeRoleKey } from '@/lib/roles';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Button } from '@/components/ui/Button';
import { QueryBoundary } from '@/components/ui/States';
import { useSchoolsOverview } from './useSuperAdmin';
import { SuperAdminNotice } from './SuperAdminNotice';
import { DeleteSchoolDialog, SchoolDetailDrawer, SchoolFormDrawer, type SchoolSummary } from './SchoolActions';
import { useSuperMutation } from './useSuperActions';

type Row = SchoolSummary;

export function SchoolsPage() {
  const overview = useSchoolsOverview();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const viewer = useDrawerState<Row>();
  const editor = useDrawerState<Row | 'new'>();
  const deleter = useDrawerState<Row>();
  const regenerate = useSuperMutation((id: string, role) => regenerateSchoolJoinCode(id, role));

  const rows = useMemo<Row[]>(() => {
    const data = overview.data;
    if (!data) return [];
    const count = (list: Array<{ school_id: string; session_date: string }>) => {
      const map = new Map<string, { n: number; last: string | null }>();
      for (const item of list) {
        const entry = map.get(item.school_id) ?? { n: 0, last: null };
        entry.n += 1;
        if (!entry.last || item.session_date > entry.last) entry.last = item.session_date;
        map.set(item.school_id, entry);
      }
      return map;
    };
    const m = count(data.measurementSessions);
    const i = count(data.immunizationSessions);
    return data.schools.map(school => {
      const active = school.school_memberships.filter(item => isConnectedMembershipStatus(item.status ?? 'active'));
      const lastM = m.get(school.id)?.last ?? null;
      const lastI = i.get(school.id)?.last ?? null;
      return {
        ...school,
        classCount: school.classes.length,
        studentCount: school.classes.reduce((sum, item) => sum + (item.student_enrollments_aggregate.aggregate?.count ?? 0), 0),
        teacherCount: active.filter(item => normalizeRoleKey(item.role) === 'teacher').length,
        adminCount: active.filter(item => normalizeRoleKey(item.role) === 'school_admin').length,
        measurementSessions: m.get(school.id)?.n ?? 0,
        immunizationSessions: i.get(school.id)?.n ?? 0,
        lastActivity: [lastM, lastI].filter(Boolean).sort().pop() ?? null,
      };
    });
  }, [overview.data]);

  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: 'Sekolah',
      sortValue: row => row.name,
      cell: row => (
        <div className="min-w-0">
          <p className="font-medium text-fg">{row.name ?? '-'}</p>
          <p className="max-w-xs truncate text-xs text-fg-subtle">
            {row.number ? `NPSN ${row.number} · ` : ''}
            {row.address ?? 'Alamat belum diisi'}
          </p>
        </div>
      ),
    },
    { key: 'students', header: 'Siswa aktif', sortValue: row => row.studentCount, cell: row => formatNumber(row.studentCount) },
    { key: 'classes', header: 'Kelas', sortValue: row => row.classCount, cell: row => row.classCount },
    { key: 'teachers', header: 'Guru', sortValue: row => row.teacherCount, cell: row => row.teacherCount },
    { key: 'admins', header: 'Admin', sortValue: row => row.adminCount, cell: row => row.adminCount },
    {
      key: 'sessions',
      header: 'Sesi ukur / imun',
      sortValue: row => row.measurementSessions + row.immunizationSessions,
      cell: row => `${row.measurementSessions} / ${row.immunizationSessions}`,
    },
    { key: 'last', header: 'Aktivitas terakhir', sortValue: row => row.lastActivity, cell: row => formatDate(row.lastActivity) },
    { key: 'created', header: 'Terdaftar', sortValue: row => row.created_at, cell: row => formatDate(row.created_at) },
    {
      key: 'actions',
      header: '',
      className: 'w-12 text-right',
      cell: row => (
        <RowActions
          actions={[
            { label: 'Buka dashboard sekolah', icon: <ExternalLink className="size-4" />, onSelect: () => navigate(`/superadmin/sekolah/${row.id}`) },
            { label: 'Ubah', icon: <Pencil className="size-4" />, onSelect: () => editor.show(row) },
            { label: 'Salin kode gabung', icon: <Copy className="size-4" />, hidden: !row.join_code, onSelect: () => copyCode(row.join_code!) },
            { label: 'Buat ulang kode gabung', icon: <RefreshCw className="size-4" />, onSelect: () => askRegenerate(row) },
            { label: 'Hapus sekolah', icon: <Trash2 className="size-4" />, tone: 'danger', onSelect: () => deleter.show(row) },
          ]}
        />
      ),
    },
  ];

  const copyCode = (code: string) =>
    void navigator.clipboard
      .writeText(code)
      .then(() => toast.success('Kode gabung disalin.', { description: code }))
      .catch(() => toast.error('Gagal menyalin kode.'));

  const askRegenerate = (row: Row) =>
    void confirm({
      title: `Buat ulang kode gabung ${row.name ?? ''}?`,
      tone: 'danger',
      confirmLabel: 'Buat ulang',
      message: 'Kode lama langsung tidak berlaku. Guru yang belum bergabung harus memakai kode baru.',
      onConfirm: async () => {
        const code = await regenerate.mutateAsync(row.id);
        toast.success('Kode gabung baru dibuat.', { description: code });
      },
    });

  const exportCsv = () =>
    downloadCsv('sekolah-mysimoka', rows, [
      { header: 'Nama Sekolah', value: row => row.name },
      { header: 'NPSN', value: row => row.number },
      { header: 'Alamat', value: row => row.address },
      { header: 'Pembuat', value: row => row.user?.email },
      { header: 'Siswa Aktif', value: row => row.studentCount },
      { header: 'Kelas', value: row => row.classCount },
      { header: 'Guru', value: row => row.teacherCount },
      { header: 'Admin', value: row => row.adminCount },
      { header: 'Sesi Pengukuran', value: row => row.measurementSessions },
      { header: 'Sesi Imunisasi', value: row => row.immunizationSessions },
      { header: 'Aktivitas Terakhir', value: row => row.lastActivity },
      { header: 'Terdaftar', value: row => row.created_at },
    ]);

  return (
    <div>
      <PageHeader
        title="Semua Sekolah"
        description="Klik sekolah untuk detail, kode gabung, dan aksi. Buka dashboard sekolah untuk mengelola datanya."
        actions={
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => editor.show('new')}>
            Tambah sekolah
          </Button>
        }
      />
      <SuperAdminNotice />
      <Card>
        <QueryBoundary isLoading={overview.isLoading} error={overview.error} onRetry={() => void overview.refetch()}>
          {() => (
            <DataTable
              rows={rows}
              columns={columns}
              getRowId={row => row.id}
              getSearchText={row => `${row.name ?? ''} ${row.number ?? ''} ${row.address ?? ''} ${row.user?.email ?? ''}`}
              searchPlaceholder="Cari nama / NPSN / alamat"
              onRowClick={row => viewer.show(row)}
              initialSort={{ key: 'students', dir: 'desc' }}
              emptyTitle="Belum ada sekolah terdaftar"
              actions={
                <Button variant="secondary" size="sm" icon={<Download className="size-3.5" />} onClick={exportCsv}>
                  Ekspor CSV
                </Button>
              }
            />
          )}
        </QueryBoundary>
      </Card>
      <SchoolDetailDrawer
        open={viewer.open}
        school={rows.find(row => row.id === viewer.target?.id) ?? viewer.target}
        onClose={viewer.close}
        onEdit={school => editor.show(school)}
        onDelete={school => deleter.show(school)}
      />
      <SchoolFormDrawer
        key={`school-${editor.key}`}
        open={editor.open}
        school={editor.target === 'new' ? null : editor.target}
        onClose={editor.close}
      />
      <DeleteSchoolDialog
        key={`delete-${deleter.key}`}
        open={deleter.open}
        school={deleter.target}
        onClose={deleter.close}
        onDeleted={viewer.close}
      />
    </div>
  );
}

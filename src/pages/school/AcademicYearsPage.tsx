import { useMemo, useState, type FormEvent } from 'react';
import { Info, Pencil, Plus, Trash2 } from 'lucide-react';
import { useSchoolScope } from '@/scope/SchoolScope';
import { useAcademicYears, useClasses, useSchoolMutation } from '@/hooks/useSchoolData';
import { createAcademicYear, deleteAcademicYear, updateAcademicYear } from '@/api/school';
import { errorMessage } from '@/api/errors';
import type { AcademicYearRow } from '@/api/types';
import { formatDate } from '@/lib/format';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { Field, FormError, Input } from '@/components/ui/Form';
import { QueryBoundary } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';

type Row = AcademicYearRow & { classCount: number; isLatest: boolean };

export function AcademicYearsPage() {
  const { can } = useSchoolScope();
  const canEdit = can.manageAcademicYears;
  const years = useAcademicYears();
  const classes = useClasses();
  const toast = useToast();
  const [editing, setEditing] = useState<AcademicYearRow | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const remove = useSchoolMutation((id: string, role) => deleteAcademicYear(id, role));

  const rows = useMemo<Row[]>(
    () =>
      (years.data ?? []).map((year, index) => ({
        ...year,
        classCount: (classes.data ?? []).filter(item => item.academic_year_id === year.id).length,
        isLatest: index === 0,
      })),
    [years.data, classes.data],
  );

  const columns: Column<Row>[] = [
    {
      key: 'label',
      header: 'Tahun ajaran',
      sortValue: row => row.label,
      cell: row => (
        <span className="inline-flex items-center gap-2 font-medium">
          {row.label ?? '-'}
          {row.isLatest ? <Badge tone="brand">Terbaru</Badge> : null}
        </span>
      ),
    },
    { key: 'start', header: 'Tahun mulai', sortValue: row => row.start_year, cell: row => row.start_year ?? '-' },
    { key: 'end', header: 'Tahun selesai', sortValue: row => row.end_year, cell: row => row.end_year ?? '-' },
    { key: 'classes', header: 'Kelas (sekolah ini)', sortValue: row => row.classCount, cell: row => row.classCount },
    { key: 'created', header: 'Dibuat', cell: row => formatDate(row.created_at) },
    ...(!canEdit
      ? []
      : [
          {
            key: 'actions',
            header: '',
            className: 'text-right whitespace-nowrap',
            cell: (row: Row) => (
              <div className="flex justify-end gap-1">
                <Button variant="ghost" size="sm" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(row)}>
                  Ubah
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-danger"
                  icon={<Trash2 className="size-3.5" />}
                  onClick={() => setDeleting(row)}
                  disabled={row.classCount > 0}
                  title={row.classCount > 0 ? 'Masih dipakai oleh kelas' : undefined}
                >
                  Hapus
                </Button>
              </div>
            ),
          },
        ]),
  ];

  return (
    <div>
      <PageHeader
        title="Tahun Ajaran"
        description="Tahun ajaran dipakai saat membuat kelas dan sebagai filter periode ringkasan."
        actions={
          !canEdit ? null : (
            <Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
              Tambah tahun ajaran
            </Button>
          )
        }
      />
      <div className="mb-4 flex items-start gap-2 rounded-xl border border-line bg-brand-50/60 px-4 py-3 text-xs text-fg-muted dark:bg-brand-900/20">
        <Info className="mt-0.5 size-4 shrink-0 text-brand-500" />
        <p>
          Tabel <code>academic_years</code> saat ini bersifat global (tanpa <code>school_id</code>) dan belum memiliki kolom status
          aktif. Seperti di aplikasi mobile, tahun ajaran terbaru (tahun mulai terbesar) dipakai sebagai default.
        </p>
      </div>
      <Card>
        <QueryBoundary isLoading={years.isLoading} error={years.error} onRetry={() => void years.refetch()}>
          {() => (
            <DataTable
              rows={rows}
              columns={columns}
              getRowId={row => row.id}
              getSearchText={row => row.label ?? ''}
              searchPlaceholder="Cari tahun ajaran"
              emptyTitle="Belum ada tahun ajaran"
            />
          )}
        </QueryBoundary>
      </Card>

      {editing ? <YearFormModal year={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
      <ConfirmDialog
        open={Boolean(deleting)}
        danger
        title="Hapus tahun ajaran?"
        message={`Tahun ajaran ${deleting?.label ?? ''} akan dihapus permanen.`}
        confirmLabel="Hapus"
        loading={remove.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await remove.mutateAsync(deleting.id);
            toast.success('Tahun ajaran dihapus.');
            setDeleting(null);
          } catch (error) {
            toast.error(errorMessage(error));
          }
        }}
      />
    </div>
  );
}

function YearFormModal({ year, onClose }: { year: AcademicYearRow | null; onClose: () => void }) {
  const toast = useToast();
  const now = new Date().getFullYear();
  const [startYear, setStartYear] = useState(year?.start_year ?? String(now));
  const [endYear, setEndYear] = useState(year?.end_year ?? String(now + 1));
  const [label, setLabel] = useState(year?.label ?? `${now}/${now + 1}`);
  const [error, setError] = useState<string | null>(null);
  const mutation = useSchoolMutation(async (_: void, role) => {
    const input = { label: label.trim(), startYear: startYear.trim(), endYear: endYear.trim() };
    if (year) await updateAcademicYear({ ...input, id: year.id }, role);
    else await createAcademicYear(input, role);
  });

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!/^\d{4}$/.test(startYear) || !/^\d{4}$/.test(endYear)) return setError('Tahun mulai & selesai harus 4 digit.');
    if (Number(endYear) < Number(startYear)) return setError('Tahun selesai tidak boleh sebelum tahun mulai.');
    if (!label.trim()) return setError('Label wajib diisi.');
    try {
      await mutation.mutateAsync();
      toast.success(year ? 'Tahun ajaran diperbarui.' : 'Tahun ajaran ditambahkan.');
      onClose();
    } catch (submitError) {
      setError(errorMessage(submitError));
    }
  };

  return (
    <Modal
      open
      title={year ? 'Ubah tahun ajaran' : 'Tambah tahun ajaran'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Batal
          </Button>
          <Button type="submit" form="year-form" loading={mutation.isPending}>
            Simpan
          </Button>
        </>
      }
    >
      <form id="year-form" onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <FormError message={error} />
        </div>
        <Field label="Tahun mulai *">
          {id => (
            <Input
              id={id}
              inputMode="numeric"
              maxLength={4}
              value={startYear}
              onChange={e => {
                setStartYear(e.target.value);
                if (/^\d{4}$/.test(e.target.value)) {
                  setEndYear(String(Number(e.target.value) + 1));
                  setLabel(`${e.target.value}/${Number(e.target.value) + 1}`);
                }
              }}
            />
          )}
        </Field>
        <Field label="Tahun selesai *">
          {id => <Input id={id} inputMode="numeric" maxLength={4} value={endYear} onChange={e => setEndYear(e.target.value)} />}
        </Field>
        <Field label="Label *" className="sm:col-span-2">
          {id => <Input id={id} value={label} onChange={e => setLabel(e.target.value)} placeholder="2025/2026" />}
        </Field>
      </form>
    </Modal>
  );
}

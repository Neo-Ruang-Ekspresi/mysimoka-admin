import { useMemo, useRef, useState, type DragEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, RefreshCw, Upload, XCircle } from 'lucide-react';
import { useSchoolScope } from '@/scope/SchoolScope';
import { useClasses, useStudents } from '@/hooks/useSchoolData';
import { importErrorSheet, importStudents, type ImportFailure, type ImportSummary } from '@/api/importExport';
import { errorMessage } from '@/api/errors';
import { downloadWorkbook, exportFileName, readSpreadsheet } from '@/lib/excel';
import {
  buildStudentTemplate,
  IMPORT_STATUS_LABEL,
  parseStudentRows,
  rowStatus,
  type ImportRowStatus,
  type ParsedStudentRow,
} from '@/lib/studentImport';
import { DURATION, EASE_OUT } from '@/lib/motion';
import { cn } from '@/lib/object';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Badge, type Tone } from '@/components/ui/Badge';
import { Tabs } from '@/components/ui/Tabs';
import { FormError } from '@/components/ui/Form';
import { toast } from '@/components/ui/Toast';

type Step = 'pick' | 'preview' | 'running' | 'done';
type ExistingMode = 'skip' | 'update';
type FilterValue = 'all' | ImportRowStatus;

const STATUS_TONE: Record<ImportRowStatus, Tone> = { new: 'success', update: 'brand', skip: 'neutral', error: 'danger' };
const PREVIEW_LIMIT = 300;

/** Tombol "Impor Excel" (admin sekolah, `can.importData`) → modal impor siswa massal. */
export function ImportStudentsButton({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const { can } = useSchoolScope();
  const [open, setOpen] = useState(false);
  if (!can.importData) return null;
  return (
    <>
      <Button variant="secondary" size={size} icon={<Upload className={size === 'sm' ? 'size-3.5' : 'size-4'} />} onClick={() => setOpen(true)}>
        Impor Excel
      </Button>
      {open ? <ImportStudentsModal onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export function ImportStudentsModal({ onClose }: { onClose: () => void }) {
  const { schoolId, schoolName, role } = useSchoolScope();
  const queryClient = useQueryClient();
  const classes = useClasses();
  const students = useStudents();
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef(false);

  const [step, setStep] = useState<Step>('pick');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ParsedStudentRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [existingMode, setExistingMode] = useState<ExistingMode>('skip');
  const [filter, setFilter] = useState<FilterValue>('all');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [templateBusy, setTemplateBusy] = useState(false);

  const dataReady = Boolean(classes.data && students.data);

  const withStatus = useMemo(
    () => rows.map(row => ({ row, status: rowStatus(row, existingMode) })),
    [rows, existingMode],
  );
  const counts = useMemo(() => {
    const result: Record<ImportRowStatus, number> = { new: 0, update: 0, skip: 0, error: 0 };
    for (const item of withStatus) result[item.status] += 1;
    return result;
  }, [withStatus]);
  const visible = filter === 'all' ? withStatus : withStatus.filter(item => item.status === filter);
  const toCommit = counts.new + counts.update;

  const invalidFailures: ImportFailure[] = withStatus
    .filter(item => item.status === 'error')
    .map(item => ({
      line: item.row.line,
      studentNumber: item.row.studentNumber,
      fullName: item.row.fullName,
      reason: item.row.errors.join('; '),
    }));

  const downloadTemplate = async () => {
    setTemplateBusy(true);
    try {
      await downloadWorkbook(buildStudentTemplate(classes.data ?? []), exportFileName(schoolName, 'template-impor-siswa', 'xlsx'));
    } catch (error) {
      toast.error('Gagal membuat template.', { description: errorMessage(error) });
    } finally {
      setTemplateBusy(false);
    }
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setParseError(null);
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      setParseError('Format tidak didukung. Gunakan file .xlsx atau .csv.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setParseError('Ukuran file maksimal 10 MB.');
      return;
    }
    if (!dataReady) {
      setParseError('Data kelas/siswa belum termuat. Coba lagi sebentar.');
      return;
    }
    setParsing(true);
    try {
      const sheet = await readSpreadsheet(file);
      const result = parseStudentRows(sheet.rows, classes.data ?? [], students.data ?? [], sheet.firstRow);
      if (result.headerLine < 0) {
        setParseError('Baris judul kolom tidak ditemukan. Gunakan template (kolom NIS, Nama lengkap, Kelas).');
        return;
      }
      if (result.missingColumns.length) {
        setParseError(`Kolom wajib tidak ada: ${result.missingColumns.join(', ')}.`);
        return;
      }
      if (result.rows.length === 0) {
        setParseError('Tidak ada baris data di file.');
        return;
      }
      if (result.rows.length > 2000) {
        setParseError(`File berisi ${result.rows.length} baris; maksimal 2.000 baris per impor.`);
        return;
      }
      setFileName(file.name);
      setRows(result.rows);
      setFilter(result.rows.some(row => row.errors.length) ? 'error' : 'all');
      setStep('preview');
    } catch (error) {
      setParseError(`File tidak dapat dibaca: ${errorMessage(error)}`);
    } finally {
      setParsing(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    void handleFile(event.dataTransfer.files[0]);
  };

  const commit = async () => {
    cancelRef.current = false;
    setStep('running');
    const create = withStatus.filter(item => item.status === 'new').map(item => item.row);
    const update = withStatus.filter(item => item.status === 'update').map(item => item.row);
    try {
      const result = await importStudents({ create, update }, role, {
        onProgress: setProgress,
        shouldCancel: () => cancelRef.current,
      });
      setSummary(result);
      if (result.failed.length === 0 && !result.cancelled) {
        toast.success('Impor siswa selesai.', { description: `${result.created} baru, ${result.updated} diperbarui.` });
      } else {
        toast.warning('Impor selesai dengan catatan.', { description: `${result.failed.length} baris gagal.` });
      }
    } catch (error) {
      setSummary({ created: 0, updated: 0, failed: [{ line: 0, studentNumber: '', fullName: '', reason: errorMessage(error) }], cancelled: false });
    } finally {
      setStep('done');
      await queryClient.invalidateQueries({ queryKey: ['school', schoolId] });
    }
  };

  const downloadErrors = (failures: ImportFailure[]) =>
    void downloadWorkbook([importErrorSheet(failures)], exportFileName(schoolName, 'galat-impor-siswa', 'xlsx')).catch(error =>
      toast.error('Gagal mengunduh laporan.', { description: errorMessage(error) }),
    );

  const running = step === 'running';
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const allFailures = summary ? [...invalidFailures, ...summary.failed].sort((a, b) => a.line - b.line) : invalidFailures;

  const footer =
    step === 'pick' ? (
      <Button variant="secondary" onClick={onClose}>
        Tutup
      </Button>
    ) : step === 'preview' ? (
      <>
        <Button variant="ghost" icon={<RefreshCw className="size-4" />} onClick={() => setStep('pick')}>
          Pilih file lain
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Batal
        </Button>
        <Button icon={<Upload className="size-4" />} disabled={toCommit === 0} onClick={() => void commit()}>
          Impor {toCommit} siswa
        </Button>
      </>
    ) : running ? (
      <Button variant="secondary" onClick={() => (cancelRef.current = true)}>
        Hentikan
      </Button>
    ) : (
      <>
        {allFailures.length ? (
          <Button variant="secondary" icon={<Download className="size-4" />} onClick={() => downloadErrors(allFailures)}>
            Unduh laporan galat
          </Button>
        ) : null}
        <Button onClick={onClose}>Selesai</Button>
      </>
    );

  return (
    <Modal
      open
      size="xl"
      title="Impor siswa dari Excel"
      description={step === 'pick' ? 'Unggah file .xlsx atau .csv sesuai template.' : fileName}
      onClose={running ? () => undefined : onClose}
      footer={footer}
    >
      {step === 'pick' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-card-muted/50 px-4 py-3">
            <div className="text-sm">
              <p className="font-medium text-fg">1. Unduh template</p>
              <p className="text-xs text-fg-subtle">
                Kolom: NIS*, Nama lengkap*, JK (L/P), Tanggal lahir (dd/mm/yyyy), Kelas*, orang tua, HP, alamat, catatan.
                Sheet kedua berisi daftar kelas valid.
              </p>
            </div>
            <Button variant="secondary" size="sm" icon={<FileSpreadsheet className="size-3.5" />} loading={templateBusy} disabled={!classes.data} onClick={() => void downloadTemplate()}>
              Unduh template
            </Button>
          </div>
          <p className="text-sm font-medium text-fg">2. Unggah file</p>
          <FormError message={parseError} />
          <label
            onDragOver={event => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors',
              dragging ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30' : 'border-line-strong hover:bg-card-muted/60',
            )}
          >
            <Upload className="size-7 text-brand-500" aria-hidden />
            <span className="text-sm font-medium text-fg">{parsing ? 'Membaca file…' : 'Tarik file ke sini atau klik untuk memilih'}</span>
            <span className="text-xs text-fg-subtle">.xlsx / .csv · maks. 2.000 baris</span>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className="sr-only"
              disabled={parsing}
              onChange={event => void handleFile(event.target.files?.[0])}
            />
          </label>
          {!dataReady ? <p className="text-xs text-fg-subtle">Memuat data kelas & siswa…</p> : null}
        </div>
      ) : null}

      {step === 'preview' ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <SummaryChip label="Baru" value={counts.new} tone="success" />
            <SummaryChip label={existingMode === 'update' ? 'Diperbarui' : 'Sudah ada (dilewati)'} value={counts.update + counts.skip} tone="brand" />
            <SummaryChip label="Galat" value={counts.error} tone="danger" />
            <SummaryChip label="Total baris" value={rows.length} tone="neutral" />
          </div>

          {counts.update + counts.skip > 0 ? (
            <fieldset className="rounded-xl border border-line px-4 py-3">
              <legend className="px-1 text-xs font-medium text-fg-muted">NIS sudah terdaftar di sekolah</legend>
              <div className="flex flex-wrap gap-4 text-sm">
                {(
                  [
                    ['skip', 'Lewati (data lama tetap)'],
                    ['update', 'Perbarui data & kelas'],
                  ] as const
                ).map(([value, label]) => (
                  <label key={value} className="flex items-center gap-2 text-fg">
                    <input
                      type="radio"
                      name="existing-mode"
                      checked={existingMode === value}
                      onChange={() => {
                        setExistingMode(value);
                        setFilter(current => (current === 'skip' || current === 'update' ? value : current));
                      }}
                      className="size-4 accent-brand-500"
                    />
                    {label}
                  </label>
                ))}
              </div>
              {existingMode === 'update' ? (
                <p className="mt-1.5 text-xs text-fg-subtle">Sel kosong di file tidak menghapus data lama. Kelas berbeda → siswa dipindah kelas.</p>
              ) : null}
            </fieldset>
          ) : null}

          <div className="flex flex-wrap items-end justify-between gap-2">
            <Tabs<FilterValue>
              value={filter}
              onChange={setFilter}
              items={[
                { value: 'all', label: 'Semua', count: rows.length },
                { value: 'new', label: 'Baru', count: counts.new },
                { value: existingMode === 'update' ? 'update' : 'skip', label: existingMode === 'update' ? 'Perbarui' : 'Dilewati', count: counts.update + counts.skip },
                { value: 'error', label: 'Galat', count: counts.error },
              ]}
            />
            {counts.error ? (
              <Button variant="ghost" size="sm" icon={<Download className="size-3.5" />} onClick={() => downloadErrors(invalidFailures)}>
                Unduh baris galat
              </Button>
            ) : null}
          </div>

          <div className="max-h-[46vh] overflow-auto rounded-lg border border-line">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="sticky top-0 z-10 bg-card-muted text-left text-xs text-fg-subtle">
                <tr>
                  <th className="px-3 py-2 font-medium">Baris</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">NIS</th>
                  <th className="px-3 py-2 font-medium">Nama</th>
                  <th className="px-3 py-2 font-medium">JK</th>
                  <th className="px-3 py-2 font-medium">Tgl lahir</th>
                  <th className="px-3 py-2 font-medium">Kelas</th>
                  <th className="px-3 py-2 font-medium">Keterangan</th>
                </tr>
              </thead>
              <tbody>
                {visible.slice(0, PREVIEW_LIMIT).map(({ row, status }) => (
                  <tr key={row.line} className={cn('border-t border-line align-top', status === 'error' && 'bg-[#FDEEEE]/50 dark:bg-danger/5')}>
                    <td className="px-3 py-2 tabular-nums text-fg-subtle">{row.line}</td>
                    <td className="px-3 py-2">
                      <Badge tone={STATUS_TONE[status]}>{IMPORT_STATUS_LABEL[status]}</Badge>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{row.studentNumber || '-'}</td>
                    <td className="px-3 py-2 font-medium text-fg">{row.fullName || '-'}</td>
                    <td className="px-3 py-2">{row.gender === 'male' ? 'L' : row.gender === 'female' ? 'P' : row.values.gender || '-'}</td>
                    <td className="px-3 py-2 tabular-nums">{row.values.dateOfBirth || '-'}</td>
                    <td className="px-3 py-2">{row.className || '-'}</td>
                    <td className="px-3 py-2 text-xs">
                      {row.errors.map(message => (
                        <p key={message} className="flex items-start gap-1 text-danger">
                          <XCircle className="mt-0.5 size-3 shrink-0" aria-hidden />
                          {message}
                        </p>
                      ))}
                      {row.warnings.map(message => (
                        <p key={message} className="flex items-start gap-1 text-[#9A6A12] dark:text-[#f0c774]">
                          <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
                          {message}
                        </p>
                      ))}
                      {row.existing && status !== 'error' ? (
                        <p className="text-fg-subtle">
                          Terdaftar: {row.existing.student.full_name} · {row.existing.className}
                        </p>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-sm text-fg-subtle">
                      Tidak ada baris.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {visible.length > PREVIEW_LIMIT ? (
            <p className="text-xs text-fg-subtle">Menampilkan {PREVIEW_LIMIT} dari {visible.length} baris. Semua baris tetap diproses.</p>
          ) : null}
        </div>
      ) : null}

      {step === 'running' ? (
        <div className="py-8">
          <p className="text-sm font-medium text-fg">Menyimpan data siswa…</p>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-card-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <motion.div
              className="h-full rounded-full bg-brand-500"
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: DURATION.slow, ease: EASE_OUT }}
            />
          </div>
          <p className="mt-2 text-xs tabular-nums text-fg-subtle">
            {progress.done} / {progress.total} baris ({pct}%) — jangan tutup halaman ini.
          </p>
        </div>
      ) : null}

      {step === 'done' && summary ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <SummaryChip label="Ditambahkan" value={summary.created} tone="success" />
            <SummaryChip label="Diperbarui" value={summary.updated} tone="brand" />
            <SummaryChip label="Dilewati" value={counts.skip} tone="neutral" />
            <SummaryChip label="Gagal / galat" value={summary.failed.length + invalidFailures.length} tone="danger" />
          </div>
          {summary.cancelled ? <FormError message="Impor dihentikan sebelum selesai. Baris yang sudah tersimpan tidak dibatalkan." /> : null}
          {allFailures.length === 0 ? (
            <div className="flex items-center gap-2 rounded-xl border border-line px-4 py-3 text-sm text-fg">
              <CheckCircle2 className="size-5 text-success" aria-hidden />
              Semua baris berhasil diproses.
            </div>
          ) : (
            <div className="max-h-[40vh] overflow-auto rounded-lg border border-line">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="sticky top-0 bg-card-muted text-left text-xs text-fg-subtle">
                  <tr>
                    <th className="px-3 py-2 font-medium">Baris</th>
                    <th className="px-3 py-2 font-medium">NIS</th>
                    <th className="px-3 py-2 font-medium">Nama</th>
                    <th className="px-3 py-2 font-medium">Alasan</th>
                  </tr>
                </thead>
                <tbody>
                  {allFailures.slice(0, PREVIEW_LIMIT).map((item, index) => (
                    <tr key={`${item.line}-${index}`} className="border-t border-line align-top">
                      <td className="px-3 py-2 tabular-nums text-fg-subtle">{item.line || '-'}</td>
                      <td className="px-3 py-2 tabular-nums">{item.studentNumber || '-'}</td>
                      <td className="px-3 py-2">{item.fullName || '-'}</td>
                      <td className="px-3 py-2 text-xs text-danger">{item.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </Modal>
  );
}

function SummaryChip({ label, value, tone }: { label: string; value: number; tone: Tone }) {
  return (
    <div className="rounded-xl border border-line px-3 py-2">
      <p className="text-xs text-fg-subtle">{label}</p>
      <div className="mt-0.5 flex items-center gap-2">
        <span className="text-lg font-semibold tabular-nums text-fg">{value.toLocaleString('id-ID')}</span>
        <span className={cn('size-2 rounded-full', { success: 'bg-success', brand: 'bg-brand-500', danger: 'bg-danger', neutral: 'bg-fg-subtle', warning: 'bg-warning' }[tone])} aria-hidden />
      </div>
    </div>
  );
}

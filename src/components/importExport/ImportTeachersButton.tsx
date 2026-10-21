import { useMemo, useRef, useState, type DragEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, RefreshCw, Upload, XCircle } from 'lucide-react';
import { useSchoolScope } from '@/scope/SchoolScope';
import { useSchoolMembers } from '@/hooks/useSchoolData';
import { addTeacher } from '@/api/school';
import { errorMessage } from '@/api/errors';
import { downloadWorkbook, exportFileName, readSpreadsheet } from '@/lib/excel';
import {
  buildTeacherTemplate,
  parseTeacherRows,
  TEACHER_STATUS_LABEL,
  teacherErrorSheet,
  teacherRowStatus,
  type ParsedTeacherRow,
  type TeacherImportFailure,
  type TeacherRowStatus,
} from '@/lib/teacherImport';
import { DURATION, EASE_OUT } from '@/lib/motion';
import { cn } from '@/lib/object';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Badge, type Tone } from '@/components/ui/Badge';
import { Tabs } from '@/components/ui/Tabs';
import { FormError } from '@/components/ui/Form';
import { toast } from '@/components/ui/Toast';

type Step = 'pick' | 'preview' | 'running' | 'done';
type FilterValue = 'all' | TeacherRowStatus;
type Summary = { created: number; failed: TeacherImportFailure[]; cancelled: boolean };

const STATUS_TONE: Record<TeacherRowStatus, Tone> = { new: 'success', skip: 'neutral', error: 'danger' };
const MAX_ROWS = 500;

/** Tombol "Impor Excel" di halaman Guru (`can.manageTeachers`) → modal impor guru massal. */
export function ImportTeachersButton() {
  const { can } = useSchoolScope();
  const [open, setOpen] = useState(false);
  if (!can.manageTeachers) return null;
  return (
    <>
      <Button variant="secondary" icon={<Upload className="size-4" />} onClick={() => setOpen(true)}>
        Impor Excel
      </Button>
      {open ? <ImportTeachersModal onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function ImportTeachersModal({ onClose }: { onClose: () => void }) {
  const { schoolId, schoolName, role } = useSchoolScope();
  const queryClient = useQueryClient();
  const members = useSchoolMembers();
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef(false);

  const [step, setStep] = useState<Step>('pick');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ParsedTeacherRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [filter, setFilter] = useState<FilterValue>('all');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [summary, setSummary] = useState<Summary | null>(null);

  const withStatus = useMemo(() => rows.map(row => ({ row, status: teacherRowStatus(row) })), [rows]);
  const counts = useMemo(() => {
    const result: Record<TeacherRowStatus, number> = { new: 0, skip: 0, error: 0 };
    for (const item of withStatus) result[item.status] += 1;
    return result;
  }, [withStatus]);
  const visible = filter === 'all' ? withStatus : withStatus.filter(item => item.status === filter);

  const invalidFailures: TeacherImportFailure[] = withStatus
    .filter(item => item.status === 'error')
    .map(item => ({ line: item.row.line, email: item.row.email, fullName: item.row.fullName, reason: item.row.errors.join('; ') }));

  const downloadTemplate = () =>
    void downloadWorkbook(buildTeacherTemplate(), exportFileName(schoolName, 'template-impor-guru', 'xlsx')).catch(error =>
      toast.error('Gagal membuat template.', { description: errorMessage(error) }),
    );

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setParseError(null);
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      setParseError('Format tidak didukung. Gunakan file .xlsx atau .csv.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setParseError('Ukuran file maksimal 5 MB.');
      return;
    }
    if (!members.data) {
      setParseError('Data guru belum termuat. Coba lagi sebentar.');
      return;
    }
    setParsing(true);
    try {
      const sheet = await readSpreadsheet(file);
      const result = parseTeacherRows(sheet.rows, members.data, sheet.firstRow);
      if (result.headerLine < 0) {
        setParseError('Baris judul kolom tidak ditemukan. Gunakan template (kolom Nama lengkap, Email).');
        return;
      }
      if (result.rows.length === 0) {
        setParseError('Tidak ada baris data di file.');
        return;
      }
      if (result.rows.length > MAX_ROWS) {
        setParseError(`File berisi ${result.rows.length} baris; maksimal ${MAX_ROWS} baris per impor.`);
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
    const queue = withStatus.filter(item => item.status === 'new').map(item => item.row);
    const failed: TeacherImportFailure[] = [];
    let created = 0;
    let cancelled = false;
    setProgress({ done: 0, total: queue.length });
    // Berurutan: tiap baris = register (bila perlu) + role + membership, sama seperti "Tambah guru".
    for (const [index, row] of queue.entries()) {
      if (cancelRef.current) {
        cancelled = true;
        break;
      }
      try {
        await addTeacher({ schoolId, email: row.email, fullName: row.fullName, password: row.password }, role);
        created += 1;
      } catch (error) {
        failed.push({ line: row.line, email: row.email, fullName: row.fullName, reason: errorMessage(error) });
      }
      setProgress({ done: index + 1, total: queue.length });
    }
    setSummary({ created, failed, cancelled });
    if (failed.length === 0 && !cancelled) toast.success('Impor guru selesai.', { description: `${created} guru ditambahkan.` });
    else toast.warning('Impor selesai dengan catatan.', { description: `${failed.length} baris gagal.` });
    setStep('done');
    await queryClient.invalidateQueries({ queryKey: ['school', schoolId] });
  };

  const downloadErrors = (failures: TeacherImportFailure[]) =>
    void downloadWorkbook([teacherErrorSheet(failures)], exportFileName(schoolName, 'galat-impor-guru', 'xlsx')).catch(error =>
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
        <Button icon={<Upload className="size-4" />} disabled={counts.new === 0} onClick={() => void commit()}>
          Impor {counts.new} guru
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
      title="Impor guru dari Excel"
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
                Kolom: Nama lengkap*, Email*, Password awal (wajib untuk akun baru, min. 6 karakter). Sheet kedua berisi petunjuk.
              </p>
            </div>
            <Button variant="secondary" size="sm" icon={<FileSpreadsheet className="size-3.5" />} onClick={downloadTemplate}>
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
            <span className="text-xs text-fg-subtle">.xlsx / .csv · maks. {MAX_ROWS} baris</span>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className="sr-only"
              disabled={parsing}
              onChange={event => void handleFile(event.target.files?.[0])}
            />
          </label>
          {!members.data ? <p className="text-xs text-fg-subtle">Memuat data guru…</p> : null}
        </div>
      ) : null}

      {step === 'preview' ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <SummaryChip label="Ditambahkan" value={counts.new} tone="success" />
            <SummaryChip label="Sudah terdaftar (dilewati)" value={counts.skip} tone="neutral" />
            <SummaryChip label="Galat" value={counts.error} tone="danger" />
            <SummaryChip label="Total baris" value={rows.length} tone="brand" />
          </div>

          <div className="flex flex-wrap items-end justify-between gap-2">
            <Tabs<FilterValue>
              value={filter}
              onChange={setFilter}
              items={[
                { value: 'all', label: 'Semua', count: rows.length },
                { value: 'new', label: 'Tambah', count: counts.new },
                { value: 'skip', label: 'Dilewati', count: counts.skip },
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
            <table className="w-full min-w-[640px] text-sm">
              <thead className="sticky top-0 z-10 bg-card-muted text-left text-xs text-fg-subtle">
                <tr>
                  <th className="px-3 py-2 font-medium">Baris</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Nama</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Password</th>
                  <th className="px-3 py-2 font-medium">Keterangan</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(({ row, status }) => (
                  <tr key={row.line} className={cn('border-t border-line align-top', status === 'error' && 'bg-[#FDEEEE]/50 dark:bg-danger/5')}>
                    <td className="px-3 py-2 tabular-nums text-fg-subtle">{row.line}</td>
                    <td className="px-3 py-2">
                      <Badge tone={STATUS_TONE[status]}>{TEACHER_STATUS_LABEL[status]}</Badge>
                    </td>
                    <td className="px-3 py-2 font-medium text-fg">{row.fullName || '-'}</td>
                    <td className="px-3 py-2">{row.email || '-'}</td>
                    <td className="px-3 py-2 text-fg-subtle">{row.password ? '••••••' : '-'}</td>
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
                      {row.existing && status !== 'error' ? <p className="text-fg-subtle">Sudah anggota sekolah ini.</p> : null}
                    </td>
                  </tr>
                ))}
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-sm text-fg-subtle">
                      Tidak ada baris.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {step === 'running' ? (
        <div className="py-8">
          <p className="text-sm font-medium text-fg">Menambahkan guru…</p>
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
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <SummaryChip label="Ditambahkan" value={summary.created} tone="success" />
            <SummaryChip label="Dilewati" value={counts.skip} tone="neutral" />
            <SummaryChip label="Gagal / galat" value={summary.failed.length + invalidFailures.length} tone="danger" />
          </div>
          {summary.cancelled ? <FormError message="Impor dihentikan sebelum selesai. Guru yang sudah ditambahkan tetap tersimpan." /> : null}
          {allFailures.length === 0 ? (
            <div className="flex items-center gap-2 rounded-xl border border-line px-4 py-3 text-sm text-fg">
              <CheckCircle2 className="size-5 text-success" aria-hidden />
              Semua baris berhasil diproses. Minta guru login di aplikasi dengan email & password awal, lalu ganti password.
            </div>
          ) : (
            <div className="max-h-[40vh] overflow-auto rounded-lg border border-line">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="sticky top-0 bg-card-muted text-left text-xs text-fg-subtle">
                  <tr>
                    <th className="px-3 py-2 font-medium">Baris</th>
                    <th className="px-3 py-2 font-medium">Email</th>
                    <th className="px-3 py-2 font-medium">Nama</th>
                    <th className="px-3 py-2 font-medium">Alasan</th>
                  </tr>
                </thead>
                <tbody>
                  {allFailures.map((item, index) => (
                    <tr key={`${item.line}-${index}`} className="border-t border-line align-top">
                      <td className="px-3 py-2 tabular-nums text-fg-subtle">{item.line || '-'}</td>
                      <td className="px-3 py-2">{item.email || '-'}</td>
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

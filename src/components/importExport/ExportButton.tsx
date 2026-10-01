import { useState } from 'react';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { useSchoolScope } from '@/scope/SchoolScope';
import {
  buildAllStudentsExport,
  buildRecapExport,
  buildSessionExport,
  studentSheet,
  type SessionKindExport,
} from '@/api/importExport';
import { errorMessage } from '@/api/errors';
import type { StudentView } from '@/lib/analytics';
import { downloadWorkbook, exportFileName, type ExportFormat } from '@/lib/excel';
import { slugify } from '@/lib/csv';
import { todayIso } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Field, Input } from '@/components/ui/Form';
import { toast } from '@/components/ui/Toast';
import { MenuButton, type MenuSection } from './MenuButton';

export type ExportButtonProps = { label?: string } & (
  | {
      kind: 'students';
      /** Baris tampilan saat ini (sudah difilter). Bila ada, menu menawarkan "tampilan ini" & "semua". */
      rows?: StudentView[];
    }
  | { kind: 'session'; sessionKind: SessionKindExport; sessionId: string }
  | { kind: 'recap' }
);

const FORMAT_ICON = {
  xlsx: <FileSpreadsheet className="size-4" />,
  csv: <FileText className="size-4" />,
};

/**
 * Tombol ekspor (dropdown Excel / CSV). Gating `can.exportData` di dalam komponen.
 *  - `kind="students"`  : data siswa (tampilan saat ini / semua)
 *  - `kind="session"`   : detail satu sesi pengukuran/imunisasi per siswa
 *  - `kind="recap"`     : rekap semua sesi (rentang tanggal) → workbook multi-sheet
 */
export function ExportButton(props: ExportButtonProps) {
  const { schoolId, schoolName, role, can } = useSchoolScope();
  const [busy, setBusy] = useState(false);
  const [recapFormat, setRecapFormat] = useState<ExportFormat | null>(null);

  if (!can.exportData) return null;

  const run = async (task: () => Promise<{ count?: number; file: string }>) => {
    setBusy(true);
    try {
      const result = await task();
      toast.success('Ekspor selesai.', { description: result.file });
    } catch (error) {
      toast.error('Ekspor gagal.', { description: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const exportStudents = (format: ExportFormat, scope: 'view' | 'all') =>
    run(async () => {
      const file = exportFileName(schoolName, scope === 'view' ? 'siswa-tampilan' : 'siswa', format);
      const sheets =
        scope === 'view' && props.kind === 'students' && props.rows
          ? [studentSheet(props.rows, schoolName, 'Tampilan saat ini (sesuai filter)')]
          : await buildAllStudentsExport(schoolId, schoolName, role);
      await downloadWorkbook(sheets, file, format);
      return { file };
    });

  const exportSession = (format: ExportFormat) =>
    run(async () => {
      if (props.kind !== 'session') throw new Error('Jenis ekspor tidak valid.');
      const { sheets, sessionName } = await buildSessionExport(
        { kind: props.sessionKind, sessionId: props.sessionId, schoolId, schoolName },
        role,
      );
      const prefix = props.sessionKind === 'measurement' ? 'pengukuran' : 'imunisasi';
      const file = exportFileName(schoolName, `${prefix}-${slugify(sessionName).slice(0, 40) || 'sesi'}`, format);
      await downloadWorkbook(sheets, file, format);
      return { file };
    });

  let sections: MenuSection[];
  if (props.kind === 'students') {
    const formats = (scope: 'view' | 'all'): MenuSection['items'] =>
      (['xlsx', 'csv'] as const).map(format => ({
        key: `${scope}-${format}`,
        icon: FORMAT_ICON[format],
        label: format === 'xlsx' ? 'Excel (.xlsx)' : 'CSV',
        onSelect: () => void exportStudents(format, scope),
      }));
    sections = props.rows
      ? [
          { title: `Tampilan ini (${props.rows.length} siswa)`, items: formats('view') },
          { title: 'Semua siswa', items: formats('all') },
        ]
      : [{ items: formats('all') }];
  } else if (props.kind === 'session') {
    sections = [
      {
        items: [
          { key: 'xlsx', icon: FORMAT_ICON.xlsx, label: 'Excel (.xlsx)', hint: 'Info sesi + data per siswa', onSelect: () => void exportSession('xlsx') },
          { key: 'csv', icon: FORMAT_ICON.csv, label: 'CSV', hint: 'Tabel per siswa saja', onSelect: () => void exportSession('csv') },
        ],
      },
    ];
  } else {
    sections = [
      {
        items: [
          { key: 'xlsx', icon: FORMAT_ICON.xlsx, label: 'Excel (.xlsx)…', hint: 'Ringkasan, pengukuran, imunisasi, siswa', onSelect: () => setRecapFormat('xlsx') },
          { key: 'csv', icon: FORMAT_ICON.csv, label: 'CSV…', hint: 'Ringkasan per sesi saja', onSelect: () => setRecapFormat('csv') },
        ],
      },
    ];
  }

  return (
    <>
      <MenuButton
        label={props.label ?? (props.kind === 'recap' ? 'Ekspor rekap' : 'Ekspor')}
        icon={<Download className="size-3.5" />}
        loading={busy}
        sections={sections}
      />
      {props.kind === 'recap' ? (
        <RecapDialog
          format={recapFormat}
          onClose={() => setRecapFormat(null)}
          onSubmit={(start, end, format) =>
            run(async () => {
              const sheets = await buildRecapExport({ schoolId, schoolName, start, end }, role);
              const file = exportFileName(schoolName, 'rekap-sesi', format);
              await downloadWorkbook(sheets, file, format);
              return { file };
            })
          }
        />
      ) : null}
    </>
  );
}

function shiftMonths(months: number): string {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function RecapDialog({
  format,
  onClose,
  onSubmit,
}: {
  format: ExportFormat | null;
  onClose: () => void;
  onSubmit: (start: string | null, end: string | null, format: ExportFormat) => Promise<void>;
}) {
  const [start, setStart] = useState(shiftMonths(3));
  const [end, setEnd] = useState(todayIso());
  const [pending, setPending] = useState(false);
  const invalid = Boolean(start && end && start > end);
  const year = new Date().getFullYear();
  const presets: Array<[string, string, string]> = [
    ['1 bulan', shiftMonths(1), todayIso()],
    ['3 bulan', shiftMonths(3), todayIso()],
    ['Tahun ini', `${year}-01-01`, todayIso()],
    ['Semua', '', ''],
  ];

  const submit = async () => {
    if (!format || invalid) return;
    setPending(true);
    await onSubmit(start || null, end || null, format);
    setPending(false);
    onClose();
  };

  return (
    <Modal
      open={format !== null}
      size="sm"
      title="Ekspor rekap sesi"
      description={format === 'csv' ? 'CSV berisi ringkasan per sesi.' : 'Workbook: Ringkasan, Pengukuran, Imunisasi, Siswa.'}
      onClose={pending ? () => undefined : onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Batal
          </Button>
          <Button icon={<Download className="size-4" />} onClick={() => void submit()} loading={pending} disabled={invalid}>
            Unduh
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap gap-1.5">
        {presets.map(([label, s, e]) => (
          <button
            key={label}
            type="button"
            onClick={() => {
              setStart(s);
              setEnd(e);
            }}
            className="rounded-full border border-line px-3 py-1 text-xs text-fg-muted transition-colors hover:bg-card-muted hover:text-fg"
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field label="Dari tanggal" hint="Kosong = sejak awal">
          {id => <Input id={id} type="date" value={start} onChange={e => setStart(e.target.value)} />}
        </Field>
        <Field label="Sampai tanggal" hint="Kosong = hingga kini" error={invalid ? 'Tanggal akhir sebelum tanggal awal.' : null}>
          {id => <Input id={id} type="date" value={end} onChange={e => setEnd(e.target.value)} />}
        </Field>
      </div>
    </Modal>
  );
}

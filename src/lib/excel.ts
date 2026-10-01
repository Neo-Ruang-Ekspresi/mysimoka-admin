/**
 * Util Excel/CSV berbasis SheetJS CE (paket dari CDN resmi sheetjs, bukan registry npm).
 * Library dimuat LAZY (dynamic import) → chunk terpisah, bundle utama tidak bertambah.
 */
import { slugify } from './csv';
import { todayIso } from './format';

type XlsxModule = typeof import('xlsx');
type CellObject = import('xlsx').CellObject;

let loader: Promise<XlsxModule> | null = null;

/** Muat SheetJS sekali (di-cache). */
export function loadXlsx(): Promise<XlsxModule> {
  loader ??= import('xlsx').catch(error => {
    loader = null;
    throw error;
  });
  return loader;
}

// ---------------------------------------------------------------------------
// Penulisan workbook
// ---------------------------------------------------------------------------

export type CellValue = string | number | boolean | null | undefined | CellObject;

export type SheetSpec = {
  name: string;
  /** Blok info di atas tabel (mis. info sesi) — baris [label, nilai]. Tidak ikut ke CSV. */
  info?: Array<[string, CellValue]>;
  /** Judul di baris pertama (opsional). */
  title?: string;
  columns: Array<{ header: string; width?: number; text?: boolean }>;
  rows: CellValue[][];
  /** Baris kosong berformat teks setelah data (untuk template). */
  blankTextRows?: number;
};

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

function toSerial(y: number, m: number, d: number, h = 0, mi = 0, s = 0): number {
  return (Date.UTC(y, m - 1, d, h, mi, s) - EXCEL_EPOCH) / 86_400_000;
}

/** Sel tanggal Excel (dd/mm/yyyy) dari ISO `YYYY-MM-DD…`; tanggal murni tidak digeser zona waktu. */
export function dateCell(value: string | null | undefined): CellValue {
  if (!value) return null;
  const pure = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (pure) return { t: 'n', v: toSerial(+pure[1], +pure[2], +pure[3]), z: 'dd/mm/yyyy' };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return { t: 'n', v: toSerial(date.getFullYear(), date.getMonth() + 1, date.getDate()), z: 'dd/mm/yyyy' };
}

/** Sel tanggal+jam lokal (dd/mm/yyyy hh:mm). */
export function dateTimeCell(value: string | null | undefined): CellValue {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return {
    t: 'n',
    v: toSerial(date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()),
    z: 'dd/mm/yyyy hh:mm',
  };
}

/** Angka dibulatkan (tetap numerik di Excel). */
export function numberCell(value: number | null | undefined, digits = 1): CellValue {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return { t: 'n', v: Math.round(value * factor) / factor, z: digits > 0 ? `0.${'0'.repeat(digits)}` : '0' };
}

function textCell(value: CellValue): CellValue {
  if (value === null || value === undefined) return { t: 's', v: '', z: '@' };
  if (typeof value === 'object') return value;
  return { t: 's', v: String(value), z: '@' };
}

function buildSheet(X: XlsxModule, spec: SheetSpec) {
  const aoa: CellValue[][] = [];
  if (spec.title) aoa.push([spec.title]);
  if (spec.info?.length) {
    for (const [label, value] of spec.info) aoa.push([label, value]);
  }
  if (aoa.length) aoa.push([]);
  const headerRow = aoa.length;
  aoa.push(spec.columns.map(column => column.header));
  for (const row of spec.rows) {
    aoa.push(row.map((value, index) => (spec.columns[index]?.text ? textCell(value) : value)));
  }
  for (let i = 0; i < (spec.blankTextRows ?? 0); i += 1) {
    aoa.push(spec.columns.map(column => (column.text ? textCell('') : null)));
  }
  const sheet = X.utils.aoa_to_sheet(aoa as unknown[][]);
  sheet['!cols'] = spec.columns.map((column, index) => ({
    wch:
      column.width ??
      Math.min(
        48,
        Math.max(
          column.header.length + 2,
          index === 0 && spec.info ? Math.max(...spec.info.map(([label]) => label.length + 2)) : 0,
          ...spec.rows.slice(0, 200).map(row => {
            const value = row[index];
            return typeof value === 'string' ? value.length + 2 : 10;
          }),
        ),
      ),
  }));
  if (spec.rows.length > 0 || spec.blankTextRows) {
    const lastRow = headerRow + spec.rows.length + (spec.blankTextRows ?? 0);
    sheet['!autofilter'] = { ref: X.utils.encode_range({ s: { r: headerRow, c: 0 }, e: { r: lastRow, c: spec.columns.length - 1 } }) };
  }
  return sheet;
}

function safeSheetName(name: string, used: Set<string>): string {
  let base = name.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Sheet';
  let candidate = base;
  for (let i = 2; used.has(candidate.toLowerCase()); i += 1) {
    const suffix = ` (${i})`;
    base = base.slice(0, 31 - suffix.length);
    candidate = `${base}${suffix}`;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

export type ExportFormat = 'xlsx' | 'csv';

/** Nama file standar: `mysimoka_<sekolah>_<jenis>_<yyyy-mm-dd>.<ext>`. */
export function exportFileName(schoolName: string, kind: string, format: ExportFormat): string {
  const school = slugify(schoolName || 'sekolah') || 'sekolah';
  return `mysimoka_${school}_${kind}_${todayIso()}.${format}`;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Unduh workbook. Format `csv` hanya menulis tabel dari `csvSheet` (default sheet pertama),
 * tanpa blok info, dengan BOM UTF-8 agar Excel membaca karakter dengan benar.
 */
export async function downloadWorkbook(
  sheets: SheetSpec[],
  filename: string,
  format: ExportFormat = 'xlsx',
  csvSheet = 0,
): Promise<void> {
  const X = await loadXlsx();
  if (format === 'csv') {
    const spec = sheets[csvSheet] ?? sheets[0];
    const sheet = buildSheet(X, { ...spec, info: undefined, title: undefined, blankTextRows: 0 });
    const csv = X.utils.sheet_to_csv(sheet, { blankrows: false });
    triggerDownload(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }), filename);
    return;
  }
  const workbook = X.utils.book_new();
  const used = new Set<string>();
  for (const spec of sheets) X.utils.book_append_sheet(workbook, buildSheet(X, spec), safeSheetName(spec.name, used));
  workbook.Props = { Title: filename, Author: 'MySimoka', CreatedDate: new Date() };
  const data = X.write(workbook, { bookType: 'xlsx', type: 'array', compression: true }) as ArrayBuffer;
  triggerDownload(
    new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    filename,
  );
}

// ---------------------------------------------------------------------------
// Pembacaan file
// ---------------------------------------------------------------------------

/** `rows[i]` = baris Excel ke-(`firstRow` + i), 1-based. */
export type RawSheet = { name: string; rows: unknown[][]; firstRow: number };

/** Baca .xlsx/.xls/.csv → baris mentah sheet pertama (nilai mentah, tanggal sebagai serial). */
export async function readSpreadsheet(file: File): Promise<RawSheet> {
  const X = await loadXlsx();
  const isCsv = /\.(csv|txt)$/i.test(file.name) || file.type === 'text/csv';
  const workbook = isCsv
    ? X.read((await file.text()).replace(/^﻿/, ''), { type: 'string', raw: true, dense: true })
    : X.read(await file.arrayBuffer(), { type: 'array', cellDates: false, dense: true });
  const name = workbook.SheetNames[0];
  if (!name) throw new Error('File tidak berisi sheet.');
  const sheet = workbook.Sheets[name];
  // blankrows: true agar indeks baris tetap sejajar dengan nomor baris di Excel.
  const rows = X.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: '', blankrows: true });
  const firstRow = sheet['!ref'] ? X.utils.decode_range(sheet['!ref']).s.r + 1 : 1;
  return { name, rows, firstRow };
}

/** Normalisasi judul kolom: huruf kecil, buang isi kurung, tanda *, spasi & tanda baca. */
export function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/** Teks sel (angka bulat tanpa desimal, trim). */
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(value);
  return String(value).replace(/\s+/g, ' ').trim();
}

/**
 * Tanggal dari sel → ISO `YYYY-MM-DD`. Menerima serial Excel, `dd/mm/yyyy`, `dd-mm-yyyy`,
 * `dd.mm.yyyy`, `yyyy-mm-dd`. Kembalikan `undefined` bila kosong, `null` bila tidak valid.
 */
export function parseCellDate(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  let y: number;
  let m: number;
  let d: number;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 1 || value > 2_958_465) return null;
    const date = new Date(EXCEL_EPOCH + Math.floor(value) * 86_400_000);
    y = date.getUTCFullYear();
    m = date.getUTCMonth() + 1;
    d = date.getUTCDate();
  } else {
    const text = String(value).trim();
    if (!text) return undefined;
    let match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(text);
    if (match) {
      d = +match[1];
      m = +match[2];
      y = +match[3];
      if (y < 100) y += y > (new Date().getFullYear() % 100) ? 1900 : 2000;
    } else {
      match = /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})(?:[T ].*)?$/.exec(text);
      if (!match) return null;
      y = +match[1];
      m = +match[2];
      d = +match[3];
    }
  }
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

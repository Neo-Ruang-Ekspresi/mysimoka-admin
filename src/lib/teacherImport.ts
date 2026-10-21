/**
 * Template, parsing, dan validasi impor guru massal (murni — tanpa akses jaringan).
 * Tiap baris diproses seperti "Tambah guru": akun dibuat bila email belum terdaftar, lalu
 * dihubungkan ke sekolah sebagai guru.
 */
import type { MembershipRow } from '@/api/types';
import { formatDateTime } from './format';
import { cellText, normalizeHeader, type CellValue, type SheetSpec } from './excel';

export type TeacherImportField = 'fullName' | 'email' | 'password';

export const TEACHER_IMPORT_COLUMNS: Array<{ field: TeacherImportField; header: string; aliases: string[]; width: number; text?: boolean }> = [
  { field: 'fullName', header: 'Nama lengkap *', aliases: ['namalengkap', 'nama', 'namaguru', 'fullname'], width: 32 },
  { field: 'email', header: 'Email *', aliases: ['email', 'surel', 'alamatemail', 'emailguru'], width: 34, text: true },
  {
    field: 'password',
    header: 'Password awal (min. 6, wajib untuk akun baru)',
    aliases: ['passwordawal', 'password', 'katasandi', 'sandi'],
    width: 40,
    text: true,
  },
];

const FIELD_BY_ALIAS = new Map(TEACHER_IMPORT_COLUMNS.flatMap(column => column.aliases.map(alias => [alias, column.field] as const)));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Sheet template: sheet 1 data (kosong, kolom teks), sheet 2 petunjuk. */
export function buildTeacherTemplate(): SheetSpec[] {
  const guide: CellValue[][] = [
    ['Petunjuk pengisian', ''],
    ['1', 'Isi data guru di sheet "Data Guru" mulai baris ke-2. Jangan ubah judul kolom.'],
    ['2', 'Kolom bertanda * wajib diisi: Nama lengkap, Email.'],
    ['3', 'Email dipakai untuk login di aplikasi MySimoka dan harus unik.'],
    ['4', 'Password awal: minimal 6 karakter, wajib bila email belum punya akun MySimoka.'],
    ['5', 'Email yang sudah punya akun cukup dihubungkan ke sekolah; password di file diabaikan (password lama tetap).'],
    ['6', 'Guru yang sudah terdaftar di sekolah ini dilewati.'],
    ['7', 'Minta guru mengganti password setelah login pertama. File .csv juga diterima (kolom sama).'],
    ['', ''],
    ['Contoh', 'Siti Aminah | siti.aminah@sekolah.sch.id | Guru2026!'],
  ];
  return [
    {
      name: 'Data Guru',
      columns: TEACHER_IMPORT_COLUMNS.map(column => ({ header: column.header, width: column.width, text: column.text })),
      rows: [],
      blankTextRows: 300,
    },
    {
      name: 'Petunjuk',
      columns: [
        { header: 'No', width: 12 },
        { header: 'Keterangan', width: 100 },
      ],
      rows: guide,
    },
  ];
}

export type TeacherRowStatus = 'new' | 'skip' | 'error';

export type ParsedTeacherRow = {
  /** Nomor baris di file (1-based, seperti di Excel). */
  line: number;
  fullName: string;
  email: string;
  password: string;
  errors: string[];
  warnings: string[];
  /** Sudah anggota sekolah ini (email sama). */
  existing: MembershipRow | null;
};

export type TeacherParseResult = { rows: ParsedTeacherRow[]; missingColumns: string[]; headerLine: number };

export function parseTeacherRows(
  rawRows: unknown[][],
  members: MembershipRow[],
  /** Nomor baris Excel untuk rawRows[0]. */
  firstRow = 1,
): TeacherParseResult {
  let headerLine = -1;
  let fieldByIndex: Array<TeacherImportField | null> = [];
  for (let i = 0; i < Math.min(rawRows.length, 10); i += 1) {
    const mapped = (rawRows[i] ?? []).map(cell => FIELD_BY_ALIAS.get(normalizeHeader(cell)) ?? null);
    const found = new Set(mapped.filter(Boolean));
    if (found.has('fullName') && found.has('email')) {
      headerLine = i;
      const seen = new Set<TeacherImportField>();
      fieldByIndex = mapped.map(field => (field && !seen.has(field) ? (seen.add(field), field) : null));
      break;
    }
  }
  if (headerLine < 0) return { rows: [], missingColumns: ['Nama lengkap', 'Email'], headerLine: -1 };

  const memberByEmail = new Map<string, MembershipRow>();
  for (const item of members) {
    const email = item.user?.email?.trim().toLowerCase();
    if (email) memberByEmail.set(email, item);
  }

  const rows: ParsedTeacherRow[] = [];
  const firstLineByEmail = new Map<string, number>();
  for (let i = headerLine + 1; i < rawRows.length; i += 1) {
    const raw = rawRows[i] ?? [];
    const values: Record<TeacherImportField, string> = { fullName: '', email: '', password: '' };
    fieldByIndex.forEach((field, index) => {
      if (field) values[field] = cellText(raw[index]);
    });
    if (!values.fullName && !values.email && !values.password) continue;

    const line = firstRow + i;
    const errors: string[] = [];
    const warnings: string[] = [];
    const email = values.email.trim().toLowerCase();
    if (!values.fullName) errors.push('Nama wajib diisi');
    if (!email) errors.push('Email wajib diisi');
    else if (!EMAIL_RE.test(email)) errors.push(`Email "${values.email}" tidak valid`);
    if (values.password && values.password.length < 6) errors.push('Password minimal 6 karakter');

    if (email) {
      const first = firstLineByEmail.get(email);
      if (first !== undefined) errors.push(`Email duplikat di file (sama dengan baris ${first})`);
      else firstLineByEmail.set(email, line);
    }

    const existing = email ? memberByEmail.get(email) ?? null : null;
    if (!existing && !values.password) warnings.push('Password kosong: hanya berhasil bila email sudah punya akun MySimoka');

    rows.push({ line, fullName: values.fullName, email, password: values.password, errors, warnings, existing });
  }
  return { rows, missingColumns: [], headerLine: firstRow + headerLine };
}

export function teacherRowStatus(row: ParsedTeacherRow): TeacherRowStatus {
  if (row.errors.length) return 'error';
  return row.existing ? 'skip' : 'new';
}

export const TEACHER_STATUS_LABEL: Record<TeacherRowStatus, string> = {
  new: 'Tambah',
  skip: 'Sudah terdaftar',
  error: 'Galat',
};

export type TeacherImportFailure = { line: number; email: string; fullName: string; reason: string };

export function teacherErrorSheet(failures: TeacherImportFailure[]): SheetSpec {
  return {
    name: 'Galat impor',
    title: 'Laporan galat impor guru',
    info: [
      ['Jumlah baris', failures.length],
      ['Dibuat', formatDateTime(new Date().toISOString())],
    ],
    columns: [
      { header: 'Baris file', width: 10 },
      { header: 'Email', width: 34, text: true },
      { header: 'Nama', width: 30 },
      { header: 'Alasan', width: 80 },
    ],
    rows: failures.map(item => [item.line, item.email, item.fullName, item.reason]),
  };
}

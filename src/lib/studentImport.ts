/**
 * Template, parsing, dan validasi impor siswa massal (murni — tanpa akses jaringan).
 */
import type { ClassRow } from '@/api/types';
import type { StudentView } from './analytics';
import { cellText, normalizeHeader, parseCellDate, type CellValue, type SheetSpec } from './excel';

export type ImportField =
  | 'studentNumber'
  | 'fullName'
  | 'gender'
  | 'dateOfBirth'
  | 'className'
  | 'parentName'
  | 'parentPhone'
  | 'address'
  | 'notes';

export const IMPORT_COLUMNS: Array<{ field: ImportField; header: string; aliases: string[]; width: number; text?: boolean }> = [
  { field: 'studentNumber', header: 'NIS *', aliases: ['nis', 'nisn', 'noinduk', 'nomorinduk', 'nomorinduksiswa', 'studentnumber'], width: 16, text: true },
  { field: 'fullName', header: 'Nama lengkap *', aliases: ['namalengkap', 'nama', 'namasiswa', 'fullname'], width: 30 },
  { field: 'gender', header: 'Jenis kelamin (L/P)', aliases: ['jeniskelamin', 'jk', 'lp', 'gender', 'kelamin'], width: 20 },
  { field: 'dateOfBirth', header: 'Tanggal lahir (dd/mm/yyyy)', aliases: ['tanggallahir', 'tgllahir', 'tgllhr', 'dob', 'dateofbirth'], width: 26, text: true },
  { field: 'className', header: 'Kelas *', aliases: ['kelas', 'namakelas', 'class', 'rombel'], width: 14 },
  { field: 'parentName', header: 'Nama orang tua', aliases: ['namaorangtua', 'orangtua', 'namaortu', 'namawali', 'wali', 'parentname'], width: 26 },
  { field: 'parentPhone', header: 'No. HP orang tua', aliases: ['nohporangtua', 'hporangtua', 'nohportu', 'nohp', 'hp', 'teleponorangtua', 'telepon', 'notelp', 'parentphone'], width: 18, text: true },
  { field: 'address', header: 'Alamat', aliases: ['alamat', 'address'], width: 36 },
  { field: 'notes', header: 'Catatan', aliases: ['catatan', 'keterangan', 'notes'], width: 28 },
];

const FIELD_BY_ALIAS = new Map(IMPORT_COLUMNS.flatMap(column => column.aliases.map(alias => [alias, column.field] as const)));

/** Sheet template: sheet 1 data (kosong, kolom teks), sheet 2 petunjuk + daftar kelas valid. */
export function buildStudentTemplate(classes: ClassRow[]): SheetSpec[] {
  const sortedClasses = [...classes].sort((a, b) => a.name.localeCompare(b.name, 'id-ID', { numeric: true }));
  const guide: CellValue[][] = [
    ['Petunjuk pengisian', ''],
    ['1', 'Isi data siswa di sheet "Data Siswa" mulai baris ke-2. Jangan ubah judul kolom.'],
    ['2', 'Kolom bertanda * wajib diisi: NIS, Nama lengkap, Kelas.'],
    ['3', 'Jenis kelamin: L (laki-laki) atau P (perempuan).'],
    ['4', 'Tanggal lahir: format dd/mm/yyyy, contoh 05/07/2016 (tanggal Excel juga diterima).'],
    ['5', 'Kelas: harus sama persis dengan salah satu nama kelas di daftar bawah (huruf besar/kecil diabaikan).'],
    ['6', 'NIS yang sudah terdaftar di sekolah dapat dilewati atau diperbarui (dipilih saat impor).'],
    ['7', 'NIS tidak boleh duplikat di dalam file. File .csv juga diterima (kolom sama).'],
    ['', ''],
    ['Contoh', '0012345678 | Budi Santoso | L | 05/07/2016 | 1A | Sri Wahyuni | 081234567890 | Jl. Melati 1 | -'],
    ['', ''],
    ['Daftar kelas valid', 'Tahun ajaran'],
    ...sortedClasses.map(item => [item.name, item.academic_year?.label ?? '-'] as CellValue[]),
  ];
  return [
    {
      name: 'Data Siswa',
      columns: IMPORT_COLUMNS.map(column => ({ header: column.header, width: column.width, text: column.text })),
      rows: [],
      blankTextRows: 500,
    },
    {
      name: 'Petunjuk & Kelas',
      columns: [
        { header: 'Kelas / No', width: 22 },
        { header: 'Keterangan', width: 90 },
      ],
      rows: guide,
    },
  ];
}

export type ImportRowStatus = 'new' | 'update' | 'skip' | 'error';

export type ParsedStudentRow = {
  /** Nomor baris di file (1-based, seperti di Excel). */
  line: number;
  values: Record<ImportField, string>;
  studentNumber: string;
  fullName: string;
  gender: 'male' | 'female' | null;
  dateOfBirth: string | null;
  classId: string | null;
  className: string;
  parentName: string;
  parentPhone: string;
  address: string;
  notes: string;
  errors: string[];
  warnings: string[];
  /** Siswa existing (NIS sudah ada di sekolah). */
  existing: StudentView | null;
};

export type ParseResult = { rows: ParsedStudentRow[]; missingColumns: string[]; headerLine: number };

function normalizeGender(value: string): 'male' | 'female' | null | false {
  const key = value.toLowerCase().replace(/[^a-z]/g, '');
  if (!key) return null;
  if (['l', 'lk', 'laki', 'lakilaki', 'pria', 'male', 'm', 'cowok'].includes(key)) return 'male';
  if (['p', 'pr', 'perempuan', 'wanita', 'female', 'f', 'w', 'cewek'].includes(key)) return 'female';
  return false;
}

function normalizeClassName(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '');
}

/** Peta nama kelas → kelas; nama ganda (beda tahun ajaran) → pilih tahun ajaran terbaru. */
function classIndex(classes: ClassRow[]) {
  const map = new Map<string, { item: ClassRow; ambiguous: boolean }>();
  for (const item of classes) {
    const key = normalizeClassName(item.name);
    const current = map.get(key);
    if (!current) {
      map.set(key, { item, ambiguous: false });
      continue;
    }
    const newer = (item.academic_year?.start_year ?? '') > (current.item.academic_year?.start_year ?? '');
    map.set(key, { item: newer ? item : current.item, ambiguous: true });
  }
  return map;
}

export function parseStudentRows(
  rawRows: unknown[][],
  classes: ClassRow[],
  existing: StudentView[],
  /** Nomor baris Excel untuk rawRows[0]. */
  firstRow = 1,
): ParseResult {
  // Cari baris judul dalam 10 baris pertama.
  let headerLine = -1;
  let fieldByIndex: Array<ImportField | null> = [];
  for (let i = 0; i < Math.min(rawRows.length, 10); i += 1) {
    const mapped = (rawRows[i] ?? []).map(cell => FIELD_BY_ALIAS.get(normalizeHeader(cell)) ?? null);
    const found = new Set(mapped.filter(Boolean));
    if (found.has('fullName') && found.size >= 2) {
      headerLine = i;
      // Kolom ganda: pakai yang pertama.
      const seen = new Set<ImportField>();
      fieldByIndex = mapped.map(field => (field && !seen.has(field) ? (seen.add(field), field) : null));
      break;
    }
  }
  if (headerLine < 0) {
    return { rows: [], missingColumns: ['NIS', 'Nama lengkap', 'Kelas'], headerLine: -1 };
  }
  const present = new Set(fieldByIndex.filter(Boolean));
  const missingColumns = IMPORT_COLUMNS.filter(
    column => ['studentNumber', 'fullName', 'className'].includes(column.field) && !present.has(column.field),
  ).map(column => column.header.replace(' *', ''));

  const classes_ = classIndex(classes);
  const existingByNis = new Map<string, StudentView>();
  for (const item of existing) {
    const nis = item.student.student_number?.trim();
    if (nis && (!existingByNis.has(nis) || item.isActive)) existingByNis.set(nis, item);
  }

  const rows: ParsedStudentRow[] = [];
  const firstLineByNis = new Map<string, number>();
  for (let i = headerLine + 1; i < rawRows.length; i += 1) {
    const raw = rawRows[i] ?? [];
    const values = Object.fromEntries(IMPORT_COLUMNS.map(column => [column.field, ''])) as Record<ImportField, string>;
    let rawDob: unknown = '';
    fieldByIndex.forEach((field, index) => {
      if (!field) return;
      if (field === 'dateOfBirth') rawDob = raw[index];
      values[field] = cellText(raw[index]);
    });
    if (Object.values(values).every(value => !value)) continue;

    const errors: string[] = [];
    const warnings: string[] = [];
    const line = firstRow + i;
    const studentNumber = values.studentNumber.replace(/\s+/g, '');
    if (!studentNumber) errors.push('NIS wajib diisi');
    else if (studentNumber.length > 30) errors.push('NIS terlalu panjang');
    if (!values.fullName) errors.push('Nama wajib diisi');

    const gender = normalizeGender(values.gender);
    if (gender === false) errors.push(`Jenis kelamin "${values.gender}" tidak dikenal (pakai L/P)`);

    const dob = parseCellDate(rawDob);
    if (dob === null) errors.push(`Tanggal lahir "${values.dateOfBirth}" tidak valid (dd/mm/yyyy)`);
    else if (dob) {
      const year = Number(dob.slice(0, 4));
      if (dob > new Date().toISOString().slice(0, 10)) errors.push('Tanggal lahir di masa depan');
      else if (year < 1950) errors.push('Tahun lahir tidak wajar');
      values.dateOfBirth = dob.split('-').reverse().join('/');
    }

    let classId: string | null = null;
    if (!values.className) errors.push('Kelas wajib diisi');
    else {
      const match = classes_.get(normalizeClassName(values.className));
      if (!match) errors.push(`Kelas "${values.className}" tidak ditemukan`);
      else {
        classId = match.item.id;
        if (match.ambiguous) warnings.push(`Nama kelas ganda; dipakai tahun ajaran ${match.item.academic_year?.label ?? 'terbaru'}`);
      }
    }

    const parentPhone = values.parentPhone.replace(/[\s.-]/g, '');
    if (parentPhone && !/^\+?\d{6,16}$/.test(parentPhone)) warnings.push('Format No. HP tidak biasa');

    if (studentNumber) {
      const first = firstLineByNis.get(studentNumber);
      if (first !== undefined) errors.push(`NIS duplikat di file (sama dengan baris ${first})`);
      else firstLineByNis.set(studentNumber, line);
    }

    const match = studentNumber ? existingByNis.get(studentNumber) ?? null : null;
    if (match && !match.isActive) warnings.push('Siswa terdaftar tetapi nonaktif');

    rows.push({
      line,
      values,
      studentNumber,
      fullName: values.fullName,
      gender: gender === false ? null : gender,
      dateOfBirth: dob ?? null,
      classId,
      className: values.className,
      parentName: values.parentName,
      parentPhone,
      address: values.address,
      notes: values.notes,
      errors,
      warnings,
      existing: match,
    });
  }
  return { rows, missingColumns, headerLine: firstRow + headerLine };
}

export function rowStatus(row: ParsedStudentRow, existingMode: 'skip' | 'update'): ImportRowStatus {
  if (row.errors.length) return 'error';
  if (row.existing) return existingMode === 'update' ? 'update' : 'skip';
  return 'new';
}

export const IMPORT_STATUS_LABEL: Record<ImportRowStatus, string> = {
  new: 'Baru',
  update: 'Perbarui',
  skip: 'Dilewati',
  error: 'Galat',
};

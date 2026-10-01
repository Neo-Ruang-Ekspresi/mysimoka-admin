export type GraphqlErrorItem = {
  message?: string;
  extensions?: { code?: string; path?: string; [key: string]: unknown };
};

export class ApiError extends Error {
  readonly code: string | null;
  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

/** Sesi habis dan refresh token gagal → user harus login ulang. */
export class AuthExpiredError extends ApiError {
  constructor(message = 'Sesi berakhir. Silakan login ulang.') {
    super(message, 'auth-expired');
    this.name = 'AuthExpiredError';
  }
}

/**
 * Hasura menolak karena role/permission: role tidak ada di JWT, tabel/kolom tidak
 * terekspos untuk role tsb ("field ... not found in type"), atau check permission gagal.
 */
export class PermissionError extends ApiError {
  readonly role: string | null;
  constructor(message: string, role: string | null, code: string | null = 'permission') {
    super(message, code);
    this.name = 'PermissionError';
    this.role = role;
  }
}

export class NetworkError extends ApiError {
  constructor(message = 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda.') {
    super(message, 'network');
    this.name = 'NetworkError';
  }
}

export function isJwtError(item: GraphqlErrorItem): boolean {
  const message = (item.message ?? '').toLowerCase();
  const code = (item.extensions?.code ?? '').toLowerCase();
  return (
    code.includes('jwt') ||
    message.includes('jwt') ||
    message.includes('unauthorized') ||
    message.includes('invalid token') ||
    message.includes('could not verify')
  );
}

export function isPermissionError(item: GraphqlErrorItem): boolean {
  const message = (item.message ?? '').toLowerCase();
  const code = (item.extensions?.code ?? '').toLowerCase();
  return (
    code === 'access-denied' ||
    code === 'permission-error' ||
    message.includes('not in allowed roles') ||
    message.includes('access denied') ||
    message.includes('permission has failed') ||
    (code === 'validation-failed' && /field '.+' not found in type/.test(message))
  );
}

/** Pesan Hasura/Postgres mentah → kategori. */
function rawText(error: unknown): string {
  return error instanceof Error ? error.message.toLowerCase() : '';
}

/** Pelanggaran foreign key (data masih direferensikan tabel lain). */
export function isForeignKeyError(error: unknown): boolean {
  const message = rawText(error);
  return message.includes('foreign key') || message.includes('violates foreign key constraint');
}

/** Pelanggaran unique (duplikat). */
export function isUniqueError(error: unknown): boolean {
  const message = rawText(error);
  return message.includes('uniqueness violation') || message.includes('duplicate key') || message.includes('unique constraint');
}

/**
 * Terjemahkan error Hasura/Postgres umum ke Bahasa Indonesia. Pesan yang sudah ramah
 * (dilempar kode kita sendiri) dikembalikan apa adanya.
 */
export function translateHasuraError(error: unknown): string | null {
  const message = rawText(error);
  if (!message) return null;
  if (isForeignKeyError(error)) {
    if (message.includes('"classes"') || message.includes('on table "classes"')) {
      return 'Kelas masih punya siswa/sesi; pindahkan atau hapus dulu.';
    }
    if (message.includes('measurement_sessions') || message.includes('immunization_sessions')) {
      return 'Sesi masih memiliki data pencatatan; hapus data siswa di sesi ini terlebih dahulu.';
    }
    if (message.includes('"students"')) return 'Siswa masih memiliki data terkait sehingga tidak dapat dihapus.';
    return 'Data masih dipakai oleh data lain sehingga tidak dapat dihapus atau diubah.';
  }
  if (isUniqueError(error)) {
    if (message.includes('student_number')) return 'NISN sudah dipakai siswa lain.';
    if (message.includes('one_per_session_student')) return 'Siswa ini sudah punya catatan di sesi tersebut.';
    if (message.includes('student_enrollments')) return 'Siswa sudah terdaftar di kelas tersebut.';
    if (message.includes('join_code')) return 'Kode gabung bentrok; silakan coba lagi.';
    if (message.includes('school_memberships')) return 'Pengguna sudah menjadi anggota sekolah ini.';
    if (message.includes('classes')) return 'Nama kelas sudah dipakai.';
    return 'Data yang sama sudah ada.';
  }
  if (message.includes('check constraint') || message.includes('violates check')) {
    return 'Nilai tidak valid (di luar aturan data). Periksa kembali isian.';
  }
  if (message.includes('not-null') || message.includes('null value in column')) {
    return 'Ada kolom wajib yang masih kosong.';
  }
  if (/field '.+' not found in type/.test(message)) {
    return 'Aksi ini belum diizinkan untuk peran Anda (permission backend belum tersedia).';
  }
  if (message.includes('permission has failed') || message.includes('access denied')) {
    return 'Anda tidak memiliki akses untuk mengubah data ini.';
  }
  if (message.includes('not in allowed roles')) return 'Peran Anda tidak diizinkan untuk aksi ini. Silakan login ulang.';
  if (message.includes('invalid input syntax for type uuid')) return 'ID data tidak valid.';
  return null;
}

export function errorMessage(error: unknown, fallback = 'Terjadi kesalahan. Silakan coba lagi.'): string {
  const translated = translateHasuraError(error);
  if (translated) return translated;
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return fallback;
}

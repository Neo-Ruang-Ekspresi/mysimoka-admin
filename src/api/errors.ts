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

export function errorMessage(error: unknown, fallback = 'Terjadi kesalahan. Silakan coba lagi.'): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return fallback;
}

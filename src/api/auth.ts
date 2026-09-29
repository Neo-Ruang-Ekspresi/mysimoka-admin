import { AUTH_BASE_URL } from '@/config/env';
import { asObject, readString } from '@/lib/object';
import { readTokenExpiry } from '@/lib/jwt';
import { isConnectedMembershipStatus, normalizeRoleKey, sortRolesByPriority } from '@/lib/roles';
import { ApiError, NetworkError } from './errors';
import { clearAuthSession, getAuthSession, setAuthSession } from './session';

// Endpoint auth service — sama dengan app mobile (REGISTER/LOGIN/REFRESH_ENDPOINT).
const LOGIN_ENDPOINT = '/login';
const REFRESH_ENDPOINT = '/refresh';
const REGISTER_ENDPOINT = '/register';

type ApiBody = Record<string, unknown>;

export type LoginResult = {
  accessToken: string;
  refreshToken: string | null;
  user: Record<string, unknown> | null;
  requiresSchoolConnection: boolean;
};

function authUrl(endpoint: string): string {
  return `${AUTH_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
}

async function parseBody(response: Response): Promise<ApiBody | null> {
  const text = await response.text();
  if (text.trim().length === 0) return null;
  try {
    return asObject(JSON.parse(text));
  } catch {
    return { message: text };
  }
}

function normalizeApiErrorMessage(body: ApiBody | null): string | null {
  if (!body) return null;
  const errors = body.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const first: unknown = errors[0];
    if (typeof first === 'string') return first;
    const message = readString(asObject(first)?.message);
    if (message) return message;
  }
  const message = readString(body.message) ?? readString(body.error);
  if (message) return message;
  const errorObject = asObject(errors);
  if (errorObject) {
    const firstValue = Object.values(errorObject)[0];
    if (Array.isArray(firstValue) && typeof firstValue[0] === 'string') return firstValue[0];
    if (typeof firstValue === 'string') return firstValue;
  }
  return null;
}

function readFirst(source: Record<string, unknown> | null, keys: string[]): string | null {
  if (!source) return null;
  for (const key of keys) {
    const value = readString(source[key]);
    if (value) return value;
  }
  return null;
}

/** Port dari normalizeLoginResult di app mobile. */
function normalizeLoginResult(body: ApiBody | null): LoginResult | null {
  const data = asObject(body?.data);
  const tokenKeys = ['access_token', 'accessToken', 'token'];
  const refreshKeys = ['refresh_token', 'refreshToken'];
  const accessToken = readFirst(body, tokenKeys) ?? readFirst(data, tokenKeys);
  if (!accessToken) return null;
  const refreshToken = readFirst(body, refreshKeys) ?? readFirst(data, refreshKeys);
  const baseUser =
    asObject(body?.user) ?? asObject(data?.user) ?? (data && (data.id || data.email) ? data : null);

  const rawMemberships: unknown[] =
    (Array.isArray(body?.memberships) ? (body?.memberships as unknown[]) : null) ??
    (Array.isArray(data?.memberships) ? (data?.memberships as unknown[]) : null) ??
    [];
  const memberships = rawMemberships
    .map(item => asObject(item))
    .filter((item): item is Record<string, unknown> => item !== null)
    .map(item => {
      const role = readString(item.role);
      return {
        role: role ? normalizeRoleKey(role) : null,
        status: readString(item.status)?.toLowerCase() ?? null,
        isDefault: item.is_default === true || item.isDefault === true,
        isActive: item.is_active === true || item.isActive === true,
      };
    });
  const connected = memberships.filter(item => item.isActive || isConnectedMembershipStatus(item.status));
  const allowedRoles = sortRolesByPriority(
    memberships.map(item => item.role).filter((role): role is string => Boolean(role)),
  );
  const selected =
    connected.find(item => item.isActive || item.isDefault) ?? connected[0] ?? memberships[0] ?? null;
  const user = baseUser
    ? {
        ...baseUser,
        ...(allowedRoles.length > 0 ? { allowed_roles: allowedRoles, allowedRoles } : {}),
        ...(selected?.role ? { active_school_role: selected.role, activeSchoolRole: selected.role } : {}),
      }
    : null;
  const flag =
    readFirst(body, ['school_status', 'schoolStatus', 'flag']) ??
    readFirst(data, ['school_status', 'schoolStatus', 'flag']);
  const requiresSchoolConnection =
    body?.requiresSchoolConnection === true ||
    data?.requiresSchoolConnection === true ||
    flag?.toUpperCase() === 'NO_SCHOOL' ||
    (memberships.length > 0 && connected.length === 0);

  return { accessToken, refreshToken, user, requiresSchoolConnection };
}

async function postJson(endpoint: string, payload: unknown): Promise<Response> {
  try {
    return await fetch(authUrl(endpoint), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new NetworkError();
  }
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const response = await postJson(LOGIN_ENDPOINT, { email: email.trim(), password });
  const body = await parseBody(response);
  if (!response.ok) {
    throw new ApiError(normalizeApiErrorMessage(body) ?? 'Login gagal. Periksa email dan password Anda.');
  }
  const result = normalizeLoginResult(body);
  if (!result) throw new ApiError('Login berhasil, tetapi respons token tidak valid.');
  setAuthSession({ accessToken: result.accessToken, refreshToken: result.refreshToken, user: result.user });
  return result;
}

/** Sama dengan mobile: register akun baru via auth service (dipakai saat menambah guru). */
export async function registerAccount(payload: {
  email: string;
  password: string;
  full_name: string;
}): Promise<void> {
  const response = await postJson(REGISTER_ENDPOINT, payload);
  if (!response.ok) {
    const body = await parseBody(response);
    throw new ApiError(normalizeApiErrorMessage(body) ?? 'Registrasi gagal. Silakan coba lagi.');
  }
}

let refreshInFlight: Promise<string | null> | null = null;

/** Refresh access token (single-flight). Body mengirim kedua gaya key seperti mobile. */
export function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const { refreshToken, user } = getAuthSession();
    if (!refreshToken) return null;
    let response: Response;
    try {
      response = await postJson(REFRESH_ENDPOINT, { refreshToken, refresh_token: refreshToken });
    } catch {
      return null;
    }
    if (!response.ok) return null;
    const result = normalizeLoginResult(await parseBody(response));
    if (!result) return null;
    setAuthSession({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken ?? refreshToken,
      user: result.user ?? user,
    });
    return result.accessToken;
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/** Token siap pakai; refresh proaktif bila exp < 30 detik lagi. */
export async function getValidAccessToken(): Promise<string | null> {
  const { accessToken, refreshToken } = getAuthSession();
  const exp = readTokenExpiry(accessToken);
  const msLeft = exp === null ? Number.POSITIVE_INFINITY : exp * 1000 - Date.now();
  if ((!accessToken || msLeft < 30_000) && refreshToken) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return refreshed;
    return accessToken && msLeft > 0 ? accessToken : null;
  }
  return accessToken;
}

export function logout(): void {
  clearAuthSession();
}

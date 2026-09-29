import { GRAPHQL_URL } from '@/config/env';
import { readAllowedRolesRaw } from '@/lib/jwt';
import { sortRolesByPriority } from '@/lib/roles';
import { getValidAccessToken, refreshAccessToken } from './auth';
import {
  ApiError,
  AuthExpiredError,
  NetworkError,
  PermissionError,
  isJwtError,
  isPermissionError,
  type GraphqlErrorItem,
} from './errors';
import { clearAuthSession, getAuthSession } from './session';

type GraphqlResponse<T> = { data?: T | null; errors?: GraphqlErrorItem[] };

export type GqlOptions = {
  /** Nilai header `x-hasura-role`. Default: role tertinggi di JWT (konvensi mobile). */
  role?: string;
  signal?: AbortSignal;
};

function defaultRole(): string | null {
  const roles = sortRolesByPriority(readAllowedRolesRaw(getAuthSession().accessToken));
  return roles[0] ?? null;
}

async function send(
  token: string,
  query: string,
  variables: Record<string, unknown> | undefined,
  options: GqlOptions,
): Promise<Response> {
  const headers = new Headers({
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  });
  const role = options.role ?? defaultRole();
  if (role) headers.set('x-hasura-role', role);
  try {
    return await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables: variables ?? {} }),
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new NetworkError();
  }
}

async function readJson<T>(response: Response): Promise<GraphqlResponse<T> | null> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as GraphqlResponse<T>;
  } catch {
    throw new ApiError(text.slice(0, 200) || 'Respons server tidak valid.');
  }
}

function expire(): never {
  clearAuthSession();
  throw new AuthExpiredError();
}

/**
 * Kirim query/mutation ke Hasura dengan konvensi yang sama dengan app mobile:
 * Bearer token + `x-hasura-role`; HTTP 401 atau error JWT → refresh token lalu retry sekali.
 * Error permission dilempar sebagai PermissionError (tanpa logout) agar UI bisa menampilkan
 * pesan "belum ada izin backend".
 */
export async function gql<T>(
  query: string,
  variables?: Record<string, unknown>,
  options: GqlOptions = {},
): Promise<T> {
  let token = await getValidAccessToken();
  if (!token) expire();

  let response = await send(token, query, variables, options);
  if (response.status === 401) {
    token = await refreshAccessToken();
    if (!token) expire();
    response = await send(token, query, variables, options);
    if (response.status === 401) expire();
  }

  let body = await readJson<T>(response);
  if (!response.ok && !body?.errors) {
    throw new ApiError(`Permintaan ke server gagal (HTTP ${response.status}).`);
  }

  if (body?.errors?.some(isJwtError)) {
    token = await refreshAccessToken();
    if (!token) expire();
    body = await readJson<T>(await send(token, query, variables, options));
    if (body?.errors?.some(isJwtError)) expire();
  }

  const errors = body?.errors ?? [];
  if (errors.length > 0) {
    const first = errors[0];
    const message = first.message ?? 'Permintaan GraphQL gagal.';
    if (isPermissionError(first)) {
      throw new PermissionError(message, options.role ?? defaultRole(), first.extensions?.code ?? null);
    }
    throw new ApiError(message, first.extensions?.code ?? null);
  }
  if (!body?.data) throw new ApiError('Respons GraphQL kosong.');
  return body.data;
}

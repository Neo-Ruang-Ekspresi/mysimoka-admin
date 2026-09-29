import { asObject, readString } from './object';

export const HASURA_CLAIMS_KEY = 'https://hasura.io/jwt/claims';

export function decodeJwtPayload(token: string | null | undefined): Record<string, unknown> | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return asObject(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}

export function readHasuraClaims(token: string | null | undefined): Record<string, unknown> | null {
  return asObject(decodeJwtPayload(token)?.[HASURA_CLAIMS_KEY]);
}

/** Role mentah (belum dinormalisasi) dari klaim `x-hasura-allowed-roles`. */
export function readAllowedRolesRaw(token: string | null | undefined): string[] {
  const claims = readHasuraClaims(token);
  const source = claims?.['x-hasura-allowed-roles'] ?? claims?.x_hasura_allowed_roles;
  return Array.isArray(source)
    ? source.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

export function readUserIdFromToken(token: string | null | undefined): string | null {
  const claims = readHasuraClaims(token);
  return readString(claims?.['x-hasura-user-id']) ?? readString(claims?.x_hasura_user_id) ??
    readString(decodeJwtPayload(token)?.sub);
}

/** Epoch detik kedaluwarsa token, atau null bila tidak ada. */
export function readTokenExpiry(token: string | null | undefined): number | null {
  const exp = decodeJwtPayload(token)?.exp;
  return typeof exp === 'number' ? exp : null;
}

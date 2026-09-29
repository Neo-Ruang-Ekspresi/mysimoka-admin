// Default sama persis dengan app mobile (mysimoka/src/services/environment.ts).
const DEFAULT_API_BASE_URL = 'https://api.mysimoka.id/';
const DEFAULT_AUTH_BASE_URL = 'https://auth.mysimoka.id/';
const DEFAULT_GRAPHQL_URL = 'https://hasura.mysimoka.id/v1/graphql';

function trimSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function pick(value: string | undefined, fallback: string): string {
  return trimSlash(value && value.trim().length > 0 ? value.trim() : fallback);
}

export const API_BASE_URL = pick(import.meta.env.VITE_API_BASE_URL, DEFAULT_API_BASE_URL);
export const AUTH_BASE_URL = pick(import.meta.env.VITE_AUTH_BASE_URL, DEFAULT_AUTH_BASE_URL);
export const GRAPHQL_URL = pick(import.meta.env.VITE_GRAPHQL_URL, DEFAULT_GRAPHQL_URL);
export const SUPERADMIN_PREVIEW =
  (import.meta.env.VITE_ENABLE_SUPERADMIN_PREVIEW ?? '').toLowerCase() === 'true';

import { asObject, readString } from '@/lib/object';

// Kunci sama dengan app mobile (AUTH_SESSION_STORAGE_KEY), disimpan di localStorage.
const AUTH_SESSION_STORAGE_KEY = 'mysimoka:auth-session';

export type AuthSession = {
  accessToken: string | null;
  refreshToken: string | null;
  user: Record<string, unknown> | null;
};

const EMPTY: AuthSession = { accessToken: null, refreshToken: null, user: null };

function load(): AuthSession {
  try {
    const raw = localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
    if (!raw) return EMPTY;
    const source = asObject(JSON.parse(raw));
    const accessToken = readString(source?.accessToken);
    const refreshToken = readString(source?.refreshToken);
    if (!accessToken && !refreshToken) return EMPTY;
    return { accessToken, refreshToken, user: asObject(source?.user) };
  } catch {
    return EMPTY;
  }
}

let current: AuthSession = load();
const listeners = new Set<(session: AuthSession) => void>();

function persist(session: AuthSession) {
  try {
    if (!session.accessToken && !session.refreshToken) {
      localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    } else {
      localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session));
    }
  } catch {
    // Abaikan kegagalan persist (mis. mode privat) agar flow tidak terblokir.
  }
}

export function getAuthSession(): AuthSession {
  return current;
}

export function setAuthSession(patch: Partial<AuthSession>): void {
  current = {
    accessToken: 'accessToken' in patch ? (patch.accessToken ?? null) : current.accessToken,
    refreshToken: 'refreshToken' in patch ? (patch.refreshToken ?? null) : current.refreshToken,
    user: 'user' in patch ? (patch.user ?? null) : current.user,
  };
  persist(current);
  listeners.forEach(listener => listener(current));
}

export function clearAuthSession(): void {
  setAuthSession({ accessToken: null, refreshToken: null, user: null });
}

export function subscribeAuthSession(listener: (session: AuthSession) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Sinkron antar-tab.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key === AUTH_SESSION_STORAGE_KEY) {
      current = load();
      listeners.forEach(listener => listener(current));
    }
  });
}

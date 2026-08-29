import type { Session } from 'next-auth';
import { getSession } from 'next-auth/react';

/**
 * AUTH-008 — the bearer token every API call carries.
 *
 * NextAuth holds it in the session cookie now, following the contract in
 * ./session-contract.ts, so nothing keeps a copy in localStorage: web storage
 * is readable by any script on the page, while the session cookie is httpOnly
 * and signed.
 *
 * `getSession()` is async and this sits off the client-render path, so
 * `authHeader()` — and `apiFetch()`, its only caller — are async too. That was
 * the one real shift the contract called out. Components read the token
 * through `useAuthToken()` instead, which stays synchronous because
 * `useSession()` is a hook.
 *
 * Signing in and out is `signIn()` / `signOut()` from next-auth/react. The old
 * `setAuthToken` / `clearAuthToken` are gone: nothing writes a token any more.
 */
/**
 * The `getSession()` call currently in flight, if there is one.
 *
 * `getSession()` is an uncached HTTP round-trip to `/api/auth/session`, and
 * `apiFetch()` makes one per request — so a page that loads ten things asks
 * for the same session ten times over. Held here, one burst becomes one
 * request: the second caller through the door awaits the first one's answer.
 *
 * Only *concurrent* calls share, and the slot is cleared the moment the
 * request settles. Caching the answer past that would break the 401 retry in
 * client.ts, which calls `authHeader()` a second time precisely to pick up a
 * token the `jwt` callback has since renewed — a cached reply would hand it
 * the same expired token and the retry would fail exactly as the first
 * attempt did.
 */
let inflight: Promise<Session | null> | null = null;

function readSession(): Promise<Session | null> {
  inflight ??= getSession().finally(() => {
    inflight = null;
  });
  return inflight;
}

export async function getAuthToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const session = await readSession();
  return session?.accessToken ?? null;
}

export async function authHeader(): Promise<Record<string, string>> {
  const token = await getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

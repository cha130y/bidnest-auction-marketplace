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
export async function getAuthToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const session = await getSession();
  return session?.accessToken ?? null;
}

export async function authHeader(): Promise<Record<string, string>> {
  const token = await getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

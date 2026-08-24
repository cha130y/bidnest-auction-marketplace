const ACCESS_TOKEN_KEY = 'bidnest_access_token';

// TODO(AUTH-008, blocked on Dev1's NextAuth setup): once NextAuth lands,
// getAuthToken()/authHeader() stop reading localStorage and instead read
// `session.accessToken` via NextAuth's `getSession()` — see
// ./session-contract.ts for the exact shape both sides agreed on. That call
// is async, so authHeader() (and apiFetch() in lib/api/client.ts, its only
// caller) becomes async too. setAuthToken()/clearAuthToken() go away
// entirely — signing in/out becomes NextAuth's `signIn()`/`signOut()`.
export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
}

export function authHeader(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

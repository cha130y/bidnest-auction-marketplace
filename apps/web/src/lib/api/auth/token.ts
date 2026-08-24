const ACCESS_TOKEN_KEY = 'bidnest_access_token';

/**
 * NextAuth owns the session; this is a mirror of the access token it hands
 * out, kept so the twelve callers already written against these helpers keep
 * working unchanged (see SessionTokenBridge, which writes it).
 *
 * The session cookie remains the real thing — NextAuth signs and expires it,
 * and apps/api re-checks the token on every request regardless (AUTH-008).
 * Nothing reads this copy for authority, only for a synchronous header.
 */
export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  if (localStorage.getItem(ACCESS_TOKEN_KEY) === token) return;
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
  // useAuthToken subscribes to `storage`, which fires in other tabs but not in
  // the one that wrote. Dispatching it keeps this tab in step too.
  window.dispatchEvent(new StorageEvent('storage', { key: ACCESS_TOKEN_KEY }));
}

export function clearAuthToken(): void {
  if (localStorage.getItem(ACCESS_TOKEN_KEY) === null) return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.dispatchEvent(new StorageEvent('storage', { key: ACCESS_TOKEN_KEY }));
}

export function authHeader(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

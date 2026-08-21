export const LOGIN_PATH = "/login"

/**
 * Where to send someone who tried to do something that needs an account.
 *
 * The login screen itself is Dev 1's NextAuth work and does not exist in
 * apps/web yet, so this currently lands on a 404 — the destination is agreed,
 * the page just has not shipped.
 *
 * Reads the current URL from `window` rather than `useSearchParams()` on
 * purpose: it is only ever called from a click handler, and the hook would
 * drag every calling page into a Suspense boundary for no benefit.
 */
export function loginHref(): string {
  const callbackUrl = `${window.location.pathname}${window.location.search}`
  return `${LOGIN_PATH}?callbackUrl=${encodeURIComponent(callbackUrl)}`
}

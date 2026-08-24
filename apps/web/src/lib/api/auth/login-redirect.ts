export const LOGIN_PATH = "/login"

/**
 * Where to send someone who tried to do something that needs an account.
 *
 * `/login` reads the `callbackUrl` back and returns the visitor to where they
 * were, the same way proxy.ts does when it turns someone away from a route
 * that needs an account.
 *
 * Reads the current URL from `window` rather than `useSearchParams()` on
 * purpose: it is only ever called from a click handler, and the hook would
 * drag every calling page into a Suspense boundary for no benefit.
 */
export function loginHref(): string {
  const callbackUrl = `${window.location.pathname}${window.location.search}`
  return `${LOGIN_PATH}?callbackUrl=${encodeURIComponent(callbackUrl)}`
}

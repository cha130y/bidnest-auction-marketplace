import { API_URL, type ApiTokens } from "@/lib/auth/api-contract"

/**
 * AUTH-004 — trading a refresh token for a fresh pair, before the access token
 * dies of old age.
 *
 * JWT_ACCESS_TTL is 15 minutes and JWT_REFRESH_TTL is 7 days. Until now the
 * refresh token was carried on the session and never spent, so every account
 * was thrown out a quarter of an hour after signing in while a week of renewal
 * sat unused beside it.
 *
 * The renewal happens in the `jwt` callback, which is the one place every
 * `auth()`, `getSession()` and `useSession()` already passes through — so no
 * caller has to know this exists.
 *
 * Server-side only. It is imported from auth.ts, whose callbacks never run in
 * the browser, and the refresh token must not reach one.
 */

/**
 * Renew this long before the token actually expires.
 *
 * Covers the flight time of the request the token is about to be used on, plus
 * any disagreement between this clock and the API's. A token that dies in the
 * gap costs the user a 401 for no reason.
 */
const SKEW_MS = 60_000

/**
 * How long a spent refresh token keeps pointing at what it was traded for.
 *
 * This is the part that matters. apps/api rotates on every refresh and treats
 * a second use of the same token as theft — it revokes *every* session on the
 * account (auth.service.ts:222). A page firing several API calls at once turns
 * into several parallel session reads, all carrying the same cookie, and
 * without this they would race to spend the same token and log the user out of
 * everything.
 *
 * So a completed refresh is remembered by the token it consumed. Whoever
 * arrives late with that same token — because their request was already in
 * flight when the cookie was replaced — is handed the pair it became, rather
 * than being sent to the API to be treated as an attacker.
 */
const GRACE_MS = 60_000

/**
 * Refreshes by the token they spend: in flight while the request is running,
 * then the result it produced until the grace period is up.
 *
 * One process, one map. A second Next instance would keep its own, which is
 * why the API's own reuse detection stays the real defence and this is only
 * here to stop us tripping it ourselves.
 */
const spent = new Map<string, Promise<ApiTokens | null>>()

/** `exp` out of a JWT payload, in ms, without verifying anything. */
function expiryOf(accessToken: string): number | null {
  const payload = accessToken.split(".")[1]
  if (!payload) return null

  try {
    // base64url → base64. atob rather than Buffer so this file stays honest
    // about running anywhere, even though today it only runs on the server.
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/")
    const claims = JSON.parse(atob(padded)) as { exp?: unknown }
    return typeof claims.exp === "number" ? claims.exp * 1000 : null
  } catch {
    return null
  }
}

/**
 * Whether the access token is close enough to expiry to be worth replacing.
 *
 * An undecodable token answers no, deliberately. Something we cannot read the
 * clock on would otherwise look expired on every single request, and each one
 * would rotate the refresh token again — a token we merely cannot parse is far
 * better left to the API to reject once.
 */
export function needsRefresh(
  accessToken: string | undefined,
  now: number = Date.now()
): boolean {
  if (!accessToken) return false
  const expiry = expiryOf(accessToken)
  if (expiry === null) return false
  return now >= expiry - SKEW_MS
}

async function requestRefresh(
  refreshToken: string
): Promise<ApiTokens | null> {
  let response: Response
  try {
    response = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store"
    })
  } catch {
    // The API being unreachable is not the same as the session being over,
    // but there is no token to carry on with either way.
    return null
  }

  if (!response.ok) return null

  const body: unknown = await response.json().catch(() => null)
  const tokens = body as ApiTokens | null
  return tokens?.accessToken && tokens.refreshToken ? tokens : null
}

/**
 * Spend a refresh token, at most once, however many callers ask at the same
 * moment. Answers null when the session is genuinely over.
 */
export function refreshTokens(
  refreshToken: string
): Promise<ApiTokens | null> {
  const already = spent.get(refreshToken)
  if (already) return already

  const attempt = requestRefresh(refreshToken).then((tokens) => {
    if (tokens) {
      // Hold the answer for stragglers, then forget it — the map would
      // otherwise grow for the life of the process.
      const timer = setTimeout(() => spent.delete(refreshToken), GRACE_MS)
      timer.unref?.()
    } else {
      // Nothing was consumed, so nothing needs remembering, and a later
      // attempt should be free to try again.
      spent.delete(refreshToken)
    }
    return tokens
  })

  spent.set(refreshToken, attempt)
  return attempt
}

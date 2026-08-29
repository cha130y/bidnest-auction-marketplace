"use client"

import { useEffect, useRef } from "react"
import { signOut, useSession } from "next-auth/react"

/**
 * AUTH-004 — the end of the line, when renewal is no longer possible.
 *
 * The `jwt` callback renews the access token quietly for as long as the
 * refresh token lasts. When that fails — seven days gone, the session revoked
 * by a password reset, or the token already spent — it marks the session
 * `RefreshFailed`, and this is what acts on it.
 *
 * Signing out rather than merely redirecting: the session cookie still exists
 * and would keep being sent, and a cookie that says "signed in" while holding
 * no usable token is the state everything else here is written not to trust.
 *
 * Renders nothing. It sits in Providers so it watches every page at once,
 * rather than each page having to remember.
 */

/** Where the last attempt is recorded, so a reload cannot forget it. */
const ATTEMPT_KEY = "bidnest_signout_attempt"

/**
 * How long one attempt speaks for.
 *
 * Long enough that a sign-out which failed to clear the session cannot
 * immediately try again — that pairing is a reload loop, since signing out
 * lands on /login and mounts this component afresh, and a ref does not
 * survive a page load. Short enough that a session which expires later in
 * the same tab is still acted on.
 */
const COOLDOWN_MS = 30_000

/** Reading web storage throws in some privacy modes; a loop is worse. */
function lastAttempt(): number {
  try {
    return Number(sessionStorage.getItem(ATTEMPT_KEY)) || 0
  } catch {
    return 0
  }
}

function recordAttempt(now: number) {
  try {
    sessionStorage.setItem(ATTEMPT_KEY, String(now))
  } catch {
    // Nothing to do: the in-memory guard below still covers this page load.
  }
}

export function SessionWatch() {
  const { data: session } = useSession()
  // signOut() navigates, but not instantly — without this the effect can run a
  // second time on the way out and start the whole thing again.
  const leaving = useRef(false)

  useEffect(() => {
    if (session?.error !== "RefreshFailed" || leaving.current) return

    // A second attempt within the cooldown means the first one did not take:
    // the session still says RefreshFailed after a sign-out and a fresh page
    // load. Trying again would only reload /login again, forever. Stop, and
    // leave the page as it is — the header already shows Log in, because a
    // session in this state carries no access token.
    const now = Date.now()
    if (now - lastAttempt() < COOLDOWN_MS) return

    leaving.current = true
    recordAttempt(now)

    void signOut({
      callbackUrl: `/login?error=${encodeURIComponent(
        "เซสชันหมดอายุแล้ว กรุณาเข้าสู่ระบบใหม่"
      )}`
    })
  }, [session?.error])

  return null
}

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
export function SessionWatch() {
  const { data: session } = useSession()
  // signOut() navigates, but not instantly — without this the effect can run a
  // second time on the way out and start the whole thing again.
  const leaving = useRef(false)

  useEffect(() => {
    if (session?.error !== "RefreshFailed" || leaving.current) return
    leaving.current = true

    void signOut({
      callbackUrl: `/login?error=${encodeURIComponent(
        "เซสชันหมดอายุแล้ว กรุณาเข้าสู่ระบบใหม่"
      )}`
    })
  }, [session?.error])

  return null
}

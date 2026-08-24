"use client"

import { useEffect } from "react"
import { useSession } from "next-auth/react"

import { clearAuthToken, setAuthToken } from "@/lib/api/auth/token"

/**
 * Copies the access token off the NextAuth session into the synchronous helper
 * the rest of the app already reads.
 *
 * Twelve modules call `authHeader()` from ordinary functions, where awaiting a
 * session is not an option. Rewriting all of them to be async would touch far
 * more code than this does, and would gain nothing: the session cookie stays
 * the source of truth either way, and apps/api re-checks the token on every
 * request (AUTH-008).
 */
export function SessionTokenBridge() {
  const { data: session, status } = useSession()

  useEffect(() => {
    if (status === "loading") return
    if (session?.accessToken) setAuthToken(session.accessToken)
    else clearAuthToken()
  }, [session?.accessToken, status])

  return null
}

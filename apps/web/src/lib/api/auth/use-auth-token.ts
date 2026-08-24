"use client"

import { useSession } from "next-auth/react"

export type AuthTokenState = {
  token: string | null
  /**
   * False until the session has been read. Guards against firing an authed
   * request before we know there is one — and against flashing a "please log
   * in" state while the answer is still on its way.
   */
  ready: boolean
}

/**
 * AUTH-008 — the access token, for components.
 *
 * Stays synchronous where `authHeader()` could not: `useSession()` is a hook,
 * so the session is already resolved by the time this renders. The
 * `{ token, ready }` shape is unchanged from the localStorage version it
 * replaces, which is what lets all seventeen call sites keep working
 * untouched — see ./session-contract.ts.
 */
export function useAuthToken(): AuthTokenState {
  const { data, status } = useSession()

  return {
    token: data?.accessToken ?? null,
    ready: status !== "loading"
  }
}

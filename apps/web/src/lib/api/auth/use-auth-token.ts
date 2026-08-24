"use client"

import { useSyncExternalStore } from "react"

import { getAuthToken } from "@/lib/api/auth/token"

export type AuthTokenState = {
  token: string | null
  /**
   * False until the first post-hydration render has read localStorage. Guards
   * against firing an authed request during SSR — and against flashing a
   * "please log in" state before we actually know.
   */
  ready: boolean
}

/** Logging in or out in another tab should not leave this one stale. */
function subscribe(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange)
  return () => window.removeEventListener("storage", onStoreChange)
}

/**
 * `undefined` marks "not read yet": the server and the hydration pass both use
 * this snapshot, so markup matches, and the real value arrives on the first
 * client render afterwards.
 */
function getServerSnapshot(): string | null | undefined {
  return undefined
}

/**
 * Reads the access token as an external store rather than in an effect —
 * localStorage lives outside React, and this is the primitive for that.
 *
 * Temporary — once NextAuth lands in apps/web (Dev 1) this hook and
 * `authHeader()` are the only two places that need to change (confirmed by
 * grep: every one of the 17 current call sites goes through one of these two
 * functions, none touch localStorage directly).
 *
 * TODO(AUTH-008, blocked on Dev1's NextAuth setup): swap this whole
 * implementation for `useSession()` from `next-auth/react` — it already
 * returns `{ data, status }`, so this becomes
 * `{ token: data?.accessToken ?? null, ready: status !== 'loading' }` and
 * every caller of `useAuthToken()` keeps its existing `{ token, ready }`
 * contract unchanged. See ./session-contract.ts for the `accessToken` shape.
 */
export function useAuthToken(): AuthTokenState {
  const token = useSyncExternalStore<string | null | undefined>(
    subscribe,
    getAuthToken,
    getServerSnapshot
  )

  return { token: token ?? null, ready: token !== undefined }
}

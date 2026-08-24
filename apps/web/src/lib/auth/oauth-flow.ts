import { cookies } from "next/headers"

import {
  API_URL,
  apiErrorMessage,
  type ApiTokens,
  type PendingResponse
} from "@/lib/auth/api-contract"

/**
 * AUTH-003 / AUTH-006 — the provider token, in the gap before the code.
 *
 * Both sign-ins arrive at the same place: a token from Google or Line that
 * apps/api will verify, and an emailed code that AUTH-007 still demands before
 * any session exists. The token has to survive that gap, and it waits here, in
 * an httpOnly cookie. The page cannot hold it — Line's leg is a full redirect
 * that would lose client state — and a query string would spread it through
 * browser history and every access log on the way.
 *
 * Server-only: `cookies()` is from next/headers, so route handlers and server
 * components may call these, and client components may not.
 */

const PENDING_COOKIE = "bidnest_oauth_pending"

/** Ties Line's callback to the browser that started it. */
export const LINE_STATE_COOKIE = "bidnest_line_state"

/** Comfortably past the code's own lifetime, so this is never why a login fails. */
const PENDING_MAX_AGE = 15 * 60

export type OAuthProvider = "google" | "line"

export type PendingOAuth = {
  provider: OAuthProvider
  idToken: string
  /**
   * Only for a first Line sign-in where Line released no address. It has to be
   * kept, not just used once: /auth/line/verify re-resolves the account from
   * the token and would find the same missing email without it.
   */
  email?: string
  /** Where the user was headed before being asked to sign in. */
  callbackUrl?: string
}

export type StartResult =
  | { ok: true; body: PendingResponse }
  | { ok: false; status: number; message: string }

export type VerifyResult =
  | { ok: true; tokens: ApiTokens }
  | { ok: false; status: number; message: string }

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: PENDING_MAX_AGE
  }
}

/**
 * A redirect target is only ever a path on this site. Anything else — an
 * absolute URL, or the `//evil.example` form a browser reads as one — would
 * turn the login page into an open redirect, and it arrives from the client.
 */
export function safeCallback(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  if (!value.startsWith("/") || value.startsWith("//")) return undefined
  return value
}

export async function readPending(): Promise<PendingOAuth | null> {
  const raw = (await cookies()).get(PENDING_COOKIE)?.value
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as PendingOAuth
    if (!parsed?.idToken) return null
    if (parsed.provider !== "google" && parsed.provider !== "line") return null
    return parsed
  } catch {
    return null
  }
}

export async function clearPending(): Promise<void> {
  ;(await cookies()).delete(PENDING_COOKIE)
}

/**
 * Step one, and every retry of it: hand the provider token to apps/api, which
 * verifies it and mails a code.
 *
 * The token is parked whichever answer comes back. PENDING_2FA needs it again
 * at the code step; EMAIL_REQUIRED needs it again at the address step that
 * follows, because AUTH-006's answer to a Line account with no email is to ask
 * the user for one and start over.
 */
export async function startOAuth(pending: PendingOAuth): Promise<StartResult> {
  const response = await fetch(`${API_URL}/auth/${pending.provider}/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: pending.idToken, email: pending.email }),
    cache: "no-store"
  })
  const result: unknown = await response.json().catch(() => ({}))

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: apiErrorMessage(result, "เข้าสู่ระบบไม่สำเร็จ")
    }
  }

  const jar = await cookies()
  jar.set(PENDING_COOKIE, JSON.stringify(pending), cookieOptions())

  return { ok: true, body: result as PendingResponse }
}

/**
 * AUTH-007 for a provider sign-in — the code step.
 *
 * The token comes back out of the cookie rather than off the request, so the
 * browser never holds it and cannot be talked into sending someone else's.
 */
export async function verifyOAuth(otp: string): Promise<VerifyResult> {
  const pending = await readPending()
  if (!pending) {
    return {
      ok: false,
      status: 400,
      message: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่"
    }
  }

  const response = await fetch(`${API_URL}/auth/${pending.provider}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      idToken: pending.idToken,
      // Belt and braces. The API re-resolves the account from the token here,
      // and by now it finds the AuthAccount step one created, so the address is
      // not consulted. Sending it anyway costs nothing and keeps this request
      // able to stand on its own, rather than on the order of the one before.
      email: pending.email,
      otp
    }),
    cache: "no-store"
  })
  const result: unknown = await response.json().catch(() => ({}))

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: apiErrorMessage(result, "ยืนยันไม่สำเร็จ")
    }
  }

  // Spent. The token pair is the session now and the provider token is done.
  await clearPending()

  return { ok: true, tokens: result as ApiTokens }
}

/**
 * The origin to build provider redirect URIs from.
 *
 * `AUTH_URL` first, because behind a proxy the request's own URL is the
 * internal one, and Line compares the redirect_uri it was given at authorize
 * time against the one sent at token time — byte for byte.
 */
export function siteOrigin(request: Request): string {
  const configured = process.env.AUTH_URL
  if (configured) return new URL(configured).origin
  return new URL(request.url).origin
}

import { cookies } from "next/headers"

import {
  API_URL,
  apiErrorMessage,
  type ApiTokens,
  type PendingResponse
} from "@/lib/auth/api-contract"
import { readDeviceToken, writeDeviceToken } from "@/lib/auth/device-cookie"

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

/**
 * Where a token pair waits when Line's callback obtained one.
 *
 * Only Line needs this. Its leg is a redirect, so the route that receives the
 * tokens can hand the page nothing but a URL — and putting a bearer token in a
 * URL would spread it through history and every access log on the way. So it
 * goes in an httpOnly cookie and the page claims it back through a route.
 *
 * Seconds, not minutes: the page claims it on mount, and a pair still sitting
 * here a minute later means the browser never arrived.
 */
const READY_COOKIE = "bidnest_oauth_ready"

/** Comfortably past the code's own lifetime, so this is never why a login fails. */
const PENDING_MAX_AGE = 15 * 60

/** Long enough for a redirect and a mount, short enough to be a non-event. */
const READY_MAX_AGE = 60

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
  | { ok: true; body: PendingResponse | ApiTokens }
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

export type ParkedTokens = { tokens: ApiTokens; callbackUrl?: string }

/** Leaves an issued pair for the page that is about to be redirected to. */
export async function parkTokens(parked: ParkedTokens): Promise<void> {
  ;(await cookies()).set(READY_COOKIE, JSON.stringify(parked), {
    ...cookieOptions(),
    maxAge: READY_MAX_AGE
  })
}

/**
 * Takes the parked pair and spends the cookie.
 *
 * One shot: a pair that has been claimed must not be claimable again, and the
 * page that claims it turns it into a session immediately. Route handlers only
 * — a Server Component cannot delete a cookie during render.
 */
export async function claimTokens(): Promise<ParkedTokens | null> {
  const jar = await cookies()
  const raw = jar.get(READY_COOKIE)?.value
  if (!raw) return null

  jar.delete(READY_COOKIE)

  try {
    const parsed = JSON.parse(raw) as ParkedTokens
    return parsed?.tokens?.accessToken ? parsed : null
  } catch {
    return null
  }
}

/** Whether a pair is waiting, without spending it — for the page to decide what to render. */
export async function hasParkedTokens(): Promise<boolean> {
  return Boolean((await cookies()).get(READY_COOKIE)?.value)
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
export async function startOAuth(
  pending: PendingOAuth,
  /**
   * Offer the trusted-device token, so a browser that has answered a code
   * before comes straight back with the token pair.
   *
   * Off for Line's callback. That leg is a full-page redirect with nowhere to
   * hand a token pair to — the page it lands on would have to be given them
   * through yet another cookie — so Line still asks for the code every time.
   * Worth doing, not worth doing badly in the same change.
   */
  options: { withDevice?: boolean } = {}
): Promise<StartResult> {
  const response = await fetch(`${API_URL}/auth/${pending.provider}/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      idToken: pending.idToken,
      email: pending.email,
      // AUTH-007 — a browser that has answered a code before skips it here
      // too, and comes back with the tokens instead of PENDING_2FA.
      deviceToken: options.withDevice ? await readDeviceToken() : undefined
    }),
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
export async function verifyOAuth(
  otp: string,
  remember?: { rememberDevice: boolean; deviceLabel?: string }
): Promise<VerifyResult> {
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
      otp,
      ...remember
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

  const { deviceToken, ...tokens } = result as ApiTokens & {
    deviceToken?: string
  }
  // Straight into the httpOnly cookie, never into the response: the one value
  // that lets a sign-in skip the second factor must not reach the page.
  if (deviceToken) await writeDeviceToken(deviceToken)

  return { ok: true, tokens: tokens as ApiTokens }
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

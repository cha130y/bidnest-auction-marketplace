import { NextResponse } from "next/server"

import {
  readPending,
  safeCallback,
  startOAuth,
  type OAuthProvider
} from "@/lib/auth/oauth-flow"

/**
 * AUTH-003 / AUTH-006 step one — ask apps/api to mail a code for this provider
 * identity.
 *
 * One route serves three moments, because they are the same request with
 * different amounts already known:
 *
 *   { provider, idToken, callbackUrl? }  a fresh Google sign-in, whose token
 *                                        the browser holds for one moment
 *   { email }                            finishing an EMAIL_REQUIRED, token
 *                                        from the cookie
 *   { }                                  "ขอรหัสใหม่", everything from cookie
 *
 * The API's own /auth/2fa/resend cannot serve the third: it takes an email and
 * a password, and an OAuth account has no password to give it. Re-running step
 * one is the resend, and the cooldown there is what rate limits it.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    provider?: string
    idToken?: string
    email?: string
    callbackUrl?: string
  }

  const parked = await readPending()

  const provider: OAuthProvider =
    body.provider === "line" || body.provider === "google"
      ? body.provider
      : (parked?.provider ?? "google")

  const idToken = body.idToken ?? parked?.idToken
  if (!idToken) {
    return NextResponse.json(
      { message: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" },
      { status: 400 }
    )
  }

  const result = await startOAuth({
    provider,
    idToken,
    email: body.email ?? parked?.email,
    callbackUrl: safeCallback(body.callbackUrl) ?? parked?.callbackUrl
  })

  if (!result.ok) {
    return NextResponse.json(
      { message: result.message },
      { status: result.status }
    )
  }

  return NextResponse.json(result.body, { status: 200 })
}

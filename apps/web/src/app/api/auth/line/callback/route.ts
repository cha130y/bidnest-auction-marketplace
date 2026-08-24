import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"

import {
  LINE_STATE_COOKIE,
  safeCallback,
  siteOrigin,
  startOAuth
} from "@/lib/auth/oauth-flow"

/**
 * AUTH-006 — the way back from Line.
 *
 * Swaps the authorization code for an ID token, which is the only thing
 * apps/api will accept, then runs the same step one a Google sign-in runs and
 * lands the user on the code screen. The channel secret is used here and
 * nowhere else, and never leaves the server.
 */

function fail(origin: string, message: string) {
  const login = new URL("/login", origin)
  login.searchParams.set("error", message)
  return NextResponse.redirect(login)
}

/** Constant-time, so a mismatched state cannot be found one character at a time. */
function sameState(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

export async function GET(request: Request) {
  const origin = siteOrigin(request)
  const params = new URL(request.url).searchParams

  const jar = await cookies()
  const rawState = jar.get(LINE_STATE_COOKIE)?.value
  // One shot either way — a state that has been answered is spent.
  jar.delete(LINE_STATE_COOKIE)

  // Line reports a refusal here rather than by not coming back at all.
  if (params.get("error")) {
    return fail(origin, "ยกเลิกการเข้าสู่ระบบด้วย LINE")
  }

  const code = params.get("code")
  const state = params.get("state")
  if (!code || !state || !rawState) {
    return fail(origin, "เซสชันหมดอายุ กรุณาลองใหม่")
  }

  let expected: { state: string; callbackUrl?: string }
  try {
    expected = JSON.parse(rawState) as { state: string; callbackUrl?: string }
  } catch {
    return fail(origin, "เซสชันไม่ถูกต้อง")
  }
  if (!sameState(state, expected.state)) {
    return fail(origin, "เซสชันไม่ถูกต้อง")
  }

  const channelId = process.env.LINE_CHANNEL_ID
  const channelSecret = process.env.LINE_CHANNEL_SECRET
  if (!channelId || !channelSecret) {
    return fail(origin, "ยังไม่ได้ตั้งค่า LINE Login")
  }

  const exchange = await fetch("https://api.line.me/oauth2/v2.1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      // Must match the authorize request byte for byte, which is why both
      // sides build it from siteOrigin() rather than from their own URL.
      redirect_uri: `${origin}/api/auth/line/callback`,
      client_id: channelId,
      client_secret: channelSecret
    }),
    cache: "no-store"
  })
  const exchanged: unknown = await exchange.json().catch(() => ({}))

  if (!exchange.ok) {
    return fail(origin, "แลกโทเคนกับ LINE ไม่สำเร็จ")
  }

  const idToken = (exchanged as { id_token?: string }).id_token
  if (!idToken) {
    // No `openid` in the granted scope is the usual cause, and it is a channel
    // setting rather than anything the user did.
    return fail(origin, "LINE ไม่ได้ส่ง ID token กลับมา")
  }

  const result = await startOAuth({
    provider: "line",
    idToken,
    callbackUrl: safeCallback(expected.callbackUrl)
  })

  if (!result.ok) {
    return fail(origin, result.message)
  }

  const verify = new URL("/login/oauth", origin)
  // AUTH-006's own case: Line released no address, so one has to be asked for
  // before there is an account to mail a code to.
  if ("status" in result.body && result.body.status === "EMAIL_REQUIRED") {
    verify.searchParams.set("need", "email")
  }
  return NextResponse.redirect(verify)
}

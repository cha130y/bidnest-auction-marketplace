import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"

import {
  LINE_STATE_COOKIE,
  clearPending,
  parkTokens,
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
  // Counted before the delete below, because "our cookie is missing" and "this
  // request carries no cookies at all" are different diagnoses and only the
  // second one means this is not the browser the flow started in.
  const cookiesOnRequest = jar.getAll().length
  // One shot either way — a state that has been answered is spent.
  jar.delete(LINE_STATE_COOKIE)

  // Line reports a refusal here rather than by not coming back at all.
  if (params.get("error")) {
    return fail(origin, "ยกเลิกการเข้าสู่ระบบด้วย LINE")
  }

  const code = params.get("code")
  const state = params.get("state")
  if (!code || !state || !rawState) {
    // Three unrelated failures wearing one message, and the person reading it
    // on screen cannot tell us which one they hit. The interesting one is a
    // missing state cookie on a request that carries other cookies — or none
    // at all — because that is a browser finishing a login another browser
    // started, which is what a phone does when the Line app takes the flow
    // over and opens the way back somewhere else. Whether things are present,
    // never what they contain.
    console.warn(
      `[line/callback] incomplete return: code=${Boolean(code)} ` +
        `state=${Boolean(state)} stateCookie=${Boolean(rawState)} ` +
        `cookiesOnRequest=${cookiesOnRequest} ` +
        `ua=${request.headers.get("user-agent") ?? "unknown"}`
    )
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

  const callbackUrl = safeCallback(expected.callbackUrl)
  const result = await startOAuth(
    { provider: "line", idToken, callbackUrl },
    // AUTH-007 — this browser may have answered a code for the account before.
    { withDevice: true }
  )

  if (!result.ok) {
    return fail(origin, result.message)
  }

  // The pair to the warning above. A completed callback followed moments later
  // by an incomplete one is one browser asking twice — the second arriving
  // after the first spent the state — rather than a cookie that never existed.
  // Without this line the two look identical in the log.
  console.log(
    `[line/callback] completed: ` +
      `${"accessToken" in result.body ? "TRUSTED_DEVICE" : result.body.status}`
  )

  const verify = new URL("/login/oauth", origin)

  // Recognised: apps/api issued the pair rather than mailing a code. A
  // redirect cannot carry it, so it waits in a cookie the landing page claims.
  if ("accessToken" in result.body) {
    await clearPending()
    await parkTokens({ tokens: result.body, callbackUrl })
    verify.searchParams.set("ready", "1")
    return NextResponse.redirect(verify)
  }

  // AUTH-006's own case: Line released no address, so one has to be asked for
  // before there is an account to mail a code to.
  if (result.body.status === "EMAIL_REQUIRED") {
    verify.searchParams.set("need", "email")
  }
  return NextResponse.redirect(verify)
}

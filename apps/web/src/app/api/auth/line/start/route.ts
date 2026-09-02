import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { randomBytes } from "node:crypto"

import {
  LINE_STATE_COOKIE,
  safeCallback,
  siteOrigin
} from "@/lib/auth/oauth-flow"

/**
 * AUTH-006 — sends the browser to Line.
 *
 * Google hands an ID token straight to the page, so its sign-in never needs a
 * leg like this. Line only ever gives back an authorization code, and turning
 * that into a token takes the channel secret — a server's job, which is the
 * whole reason this route and its callback exist.
 */
export async function GET(request: Request) {
  const channelId = process.env.LINE_CHANNEL_ID
  if (!channelId) {
    return NextResponse.json(
      { message: "ยังไม่ได้ตั้งค่า LINE_CHANNEL_ID" },
      { status: 503 }
    )
  }

  const origin = siteOrigin(request)
  const callbackUrl = safeCallback(
    new URL(request.url).searchParams.get("callbackUrl")
  )

  // Ties the callback to this browser: without it, someone could finish their
  // own Line login and have the result land in a victim's session. The
  // callbackUrl rides along inside the cookie rather than in the URL, so it
  // cannot be swapped between here and the way back.
  const state = randomBytes(16).toString("hex")
  const jar = await cookies()
  jar.set(LINE_STATE_COOKIE, JSON.stringify({ state, callbackUrl }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60
  })

  const authorize = new URL("https://access.line.me/oauth2/v2.1/authorize")
  authorize.searchParams.set("response_type", "code")
  authorize.searchParams.set("client_id", channelId)
  authorize.searchParams.set(
    "redirect_uri",
    `${origin}/api/auth/line/callback`
  )
  authorize.searchParams.set("state", state)
  // `openid` is what makes Line return an ID token at all; `profile` carries
  // the display name. Email is deliberately not asked for — AUTH-006 is built
  // around not getting one, and the permission needs Line's own approval.
  authorize.searchParams.set("scope", "openid profile")
  /**
   * Keep the whole sign-in in the browser that started it.
   *
   * Left to itself, a phone with the Line app installed does not finish this
   * where it began: Line hands the login to the app, and the app opens the way
   * back in its own in-app browser. That browser is a different cookie jar, so
   * the state cookie set above — the thing that ties the callback to this
   * browser — is not on the request, and the callback can only refuse it.
   *
   * Measured on production, and it is not subtle. Every desktop attempt
   * completed; the one from an iPhone arrived at the callback carrying Line's
   * own `liffClientId` and `liffRedirectUri`, which only its in-app browser
   * adds, and `cookiesOnRequest=0` — not our cookie missing, but a browser
   * that had never seen this site at all.
   *
   * The cost is the one-tap login on mobile: with this set, somebody signing
   * in on a phone gets Line's SSO screen, or its email login if SSO has
   * nothing to offer. Worth it against a sign-in that cannot succeed. Carrying
   * the state in the URL instead would survive the browser change, but the
   * cookie is what stops somebody else's Line login landing in this session,
   * and a query parameter cannot do that job.
   *
   * https://developers.line.biz/en/docs/line-login/integrate-line-login/
   */
  authorize.searchParams.set("disable_auto_login", "true")

  return NextResponse.redirect(authorize)
}

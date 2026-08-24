import { NextResponse } from "next/server"

import { verifyOAuth } from "@/lib/auth/oauth-flow"

/**
 * AUTH-007 for a provider sign-in — the code step.
 *
 * Returns the token pair apps/api issued so the page can hand it straight to
 * `signIn("oauth-tokens")`. Nothing is stored here: NextAuth's session cookie
 * is where it lands, per lib/api/auth/session-contract.ts.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    otp?: string
    rememberDevice?: boolean
    deviceLabel?: string
  }

  if (!body.otp) {
    return NextResponse.json({ message: "กรอกรหัสยืนยัน" }, { status: 400 })
  }

  const result = await verifyOAuth(
    body.otp,
    body.rememberDevice
      ? { rememberDevice: true, deviceLabel: body.deviceLabel }
      : undefined
  )

  if (!result.ok) {
    return NextResponse.json(
      { message: result.message },
      { status: result.status }
    )
  }

  return NextResponse.json(result.tokens, { status: 200 })
}

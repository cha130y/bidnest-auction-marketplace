import { NextResponse } from "next/server"

import { claimTokens } from "@/lib/auth/oauth-flow"

/**
 * AUTH-007 — hands the page the token pair Line's callback obtained.
 *
 * Line's leg is a redirect, so the route that receives the tokens has no way
 * to give them to the page except through a cookie, and a Server Component
 * cannot spend one during render. This is where it is spent: one shot, and the
 * page turns the result straight into a session.
 */
export async function POST() {
  const parked = await claimTokens()

  if (!parked) {
    return NextResponse.json(
      { message: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" },
      { status: 400 }
    )
  }

  return NextResponse.json(parked, { status: 200 })
}

import { NextResponse } from "next/server"

import { API_URL, apiErrorMessage } from "@/lib/auth/api-contract"
import { readDeviceToken } from "@/lib/auth/device-cookie"

/**
 * AUTH-002 step one, run on the server so the device cookie can be read.
 *
 * The browser used to call the API directly here. It cannot any more: the
 * token that lets a known browser skip the code is httpOnly by design, so the
 * page has no way to attach it and this route does it instead.
 *
 * Two answers come back. PENDING_2FA means the code went out and the screen
 * asks for it, as before. Anything with an accessToken means the API
 * recognised the device and let the login through — the page turns that
 * straight into a session.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    email?: string
    password?: string
  }

  const response = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: body.email,
      password: body.password,
      deviceToken: await readDeviceToken()
    }),
    cache: "no-store"
  })
  const result: unknown = await response.json().catch(() => ({}))

  if (!response.ok) {
    return NextResponse.json(
      { message: apiErrorMessage(result, "เข้าสู่ระบบไม่สำเร็จ") },
      { status: response.status }
    )
  }

  return NextResponse.json(result, { status: 200 })
}

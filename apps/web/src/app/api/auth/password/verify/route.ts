import { NextResponse } from "next/server"

import {
  API_URL,
  apiErrorMessage,
  type ApiTokens
} from "@/lib/auth/api-contract"
import { writeDeviceToken } from "@/lib/auth/device-cookie"

/**
 * AUTH-002 step two — the code, and the point where a browser gets remembered.
 *
 * The device token the API mints never reaches the page. It is put straight
 * into the httpOnly cookie and stripped from the body, so the one value that
 * would let a sign-in skip the second factor is not sitting in a variable any
 * script on the page could reach.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    email?: string
    password?: string
    otp?: string
    rememberDevice?: boolean
    deviceLabel?: string
  }

  const response = await fetch(`${API_URL}/auth/2fa/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store"
  })
  const result: unknown = await response.json().catch(() => ({}))

  if (!response.ok) {
    return NextResponse.json(
      { message: apiErrorMessage(result, "ยืนยันไม่สำเร็จ") },
      { status: response.status }
    )
  }

  const { deviceToken, ...tokens } = result as ApiTokens & {
    deviceToken?: string
  }
  if (deviceToken) await writeDeviceToken(deviceToken)

  return NextResponse.json(tokens, { status: 200 })
}

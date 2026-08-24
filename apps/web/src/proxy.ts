import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import { auth } from "@/auth"

/**
 * AUTH-008 — the client half of protected routes.
 *
 * SRS calls this "NextAuth middleware"; Next 16 deprecated `middleware.ts` in
 * favour of `proxy.ts`, and this is the same thing under the new name.
 *
 * This is a redirect for the user's benefit, not the security boundary. Every
 * request still has its token re-checked by the NestJS guard, which is what
 * AUTH-008 actually turns on — a proxy that was bypassed would only get the
 * caller a 401 from the API.
 */
const PROTECTED = [
  "/profile",
  "/sell",
  "/cart",
  "/checkout",
  "/orders",
  "/watchlist",
  "/notifications",
  "/admin"
]

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  const needsAccount = PROTECTED.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  )
  if (!needsAccount) return NextResponse.next()

  const session = await auth()
  if (session?.accessToken) return NextResponse.next()

  // Carry where they were headed so login can send them back afterwards.
  const login = new URL("/login", request.url)
  login.searchParams.set("callbackUrl", `${pathname}${request.nextUrl.search}`)
  return NextResponse.redirect(login)
}

export const config = {
  // Everything except Next's own assets and the auth routes themselves, which
  // would otherwise redirect the sign-in flow into itself.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"]
}

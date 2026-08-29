import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getToken } from "next-auth/jwt"

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
 *
 * `getToken` rather than `auth()`, and the difference is not stylistic.
 * `auth()` runs the jwt callback, which renews the access token when it is
 * near expiry — and renewal rotates the refresh token at apps/api, which
 * hands back a new one that has to reach the browser. A proxy cannot deliver
 * it: the response returned here is a fresh `NextResponse`, carrying none of
 * the cookies NextAuth wanted to set. So the rotation happened, the browser
 * kept the spent token, and its next renewal replayed it — which apps/api
 * treats as theft and answers by revoking every session on the account.
 *
 * Measured: one visit to a protected page left four session rows, all
 * revoked, and two "refresh token replayed" warnings in the API log.
 *
 * `getToken` decodes and verifies the session cookie without running any
 * callback, so nothing is renewed and nothing rotates. Renewal belongs to
 * /api/auth/session, a route handler, which can actually set the cookie.
 */
const PROTECTED = [
  "/profile",
  "/sell",
  "/cart",
  "/chat",
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

  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: process.env.NODE_ENV === "production"
  })

  // The same test the session callback applies: a token with no access token
  // is a session that cannot call the API, whatever else it still holds.
  if (token?.accessToken) return NextResponse.next()

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

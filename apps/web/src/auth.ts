import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"

import {
  API_URL,
  apiErrorMessage,
  type ApiTokens
} from "@/lib/auth/api-contract"

/**
 * AUTH-002 / AUTH-007 — NextAuth owns the browser session; apps/api stays the
 * source of truth for the tokens themselves (SRS AUTH-004).
 *
 * The Credentials provider calls `authorize()` exactly once, which is why the
 * login screen collects the password and the emailed code over two steps and
 * then posts both together. Step one — mailing the code — is a plain call to
 * POST /auth/login before `signIn()` is ever reached.
 *
 * OAuth is handled by its own provider below rather than by NextAuth's Google
 * and Line providers: AUTH-007 makes the emailed code mandatory on those paths
 * too, and a provider redirect cannot pause midway to ask for one.
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      id: "credentials",
      name: "Email and password",
      credentials: {
        email: {},
        password: {},
        otp: {}
      },
      async authorize(raw) {
        const email = typeof raw.email === "string" ? raw.email : ""
        const password = typeof raw.password === "string" ? raw.password : ""
        const otp = typeof raw.otp === "string" ? raw.otp : ""
        if (!email || !password || !otp) return null

        const response = await fetch(`${API_URL}/auth/2fa/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, otp })
        })
        const body: unknown = await response.json().catch(() => ({}))

        if (!response.ok) {
          // NextAuth turns a thrown CredentialsSignin into a generic error for
          // the client, so the page reads the real reason from the step-one
          // call instead. Returning null keeps the message here from leaking
          // whether it was the password or the code that was wrong.
          return null
        }

        const tokens = body as ApiTokens
        return {
          id: tokens.user.id,
          email: tokens.user.email,
          name: tokens.user.displayName,
          role: tokens.user.role,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken
        }
      }
    }),

    /**
     * AUTH-003 / AUTH-006 — the provider dance and the emailed code both
     * finish before this runs, so all it does is turn the token pair apps/api
     * already issued into a session.
     */
    Credentials({
      id: "oauth-tokens",
      name: "Google or Line",
      credentials: { payload: {} },
      authorize(raw) {
        if (typeof raw.payload !== "string") return null

        let tokens: ApiTokens
        try {
          tokens = JSON.parse(raw.payload) as ApiTokens
        } catch {
          return null
        }
        if (!tokens?.accessToken || !tokens.user?.id) return null

        return {
          id: tokens.user.id,
          email: tokens.user.email,
          name: tokens.user.displayName,
          role: tokens.user.role,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken
        }
      }
    })
  ],
  callbacks: {
    jwt({ token, user }) {
      // `user` is only present on the sign-in pass; afterwards the values
      // already on the token are what carry through.
      if (user) {
        token.accessToken = user.accessToken
        token.refreshToken = user.refreshToken
        token.role = user.role
      }
      return token
    },
    session({ session, token }) {
      // next-auth reaches its JWT type through @auth/core, which pnpm keeps
      // nested and out of this package's resolution — so the declaration merge
      // in types/next-auth.d.ts cannot reach the callback signature. Reading
      // the two fields through a narrow local type keeps the values honest
      // without pretending the augmentation worked.
      const carried = token as {
        accessToken?: string
        role?: "USER" | "ADMIN"
      }
      session.accessToken = carried.accessToken
      session.role = carried.role
      if (session.user) session.user.id = token.sub ?? ""
      return session
    }
  }
})

export { apiErrorMessage }

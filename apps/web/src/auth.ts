import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"

import { apiErrorMessage, type ApiTokens } from "@/lib/auth/api-contract"

/**
 * AUTH-002 / AUTH-007 — NextAuth owns the browser session; apps/api stays the
 * source of truth for the tokens themselves (SRS AUTH-004).
 *
 * One provider, for every way in. Password, Google and Line all finish at a
 * route handler under /api/auth, which is where the tokens are obtained and
 * where the httpOnly cookies live — the pending provider token for OAuth, and
 * the trusted-device token that lets a known browser skip the code. By the
 * time `signIn()` runs, apps/api has already issued the pair and all that is
 * left is turning it into a session.
 *
 * NextAuth's own Google and Line providers are not used: AUTH-007 makes the
 * emailed code mandatory the first time on any path, and a provider redirect
 * cannot pause midway to ask for one.
 *
 * There used to be a second, `credentials` provider that posted email,
 * password and code to /auth/2fa/verify from here. It is gone: authorize()
 * cannot set a cookie, so it had no way to keep a device token, and leaving it
 * in would have meant two password sign-ins with different security
 * properties.
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    /**
     * Every sign-in ends here. The provider dance, or the password and the
     * code, all finish before this runs — so all it does is turn the token
     * pair apps/api already issued into a session.
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
    jwt({ token, user, trigger, session }) {
      // `user` is only present on the sign-in pass; afterwards the values
      // already on the token are what carry through.
      if (user) {
        token.accessToken = user.accessToken
        token.refreshToken = user.refreshToken
        token.role = user.role
      }

      // USR-001 — renaming yourself. The header reads the display name off the
      // session, so without this it would keep the old one until the next sign
      // in. Only the name is taken: `session` here is whatever the caller
      // passed to `update()`, which is client input and not to be trusted with
      // anything that decides access.
      if (trigger === "update" && session && typeof session === "object") {
        const patch = session as { name?: unknown }
        if (typeof patch.name === "string" && patch.name.trim() !== "") {
          token.name = patch.name
        }
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

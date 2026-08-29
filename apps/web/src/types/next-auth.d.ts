import type { DefaultSession } from "next-auth"

/**
 * The API's tokens ride along on the session so every existing caller can keep
 * asking for a bearer token the way it always has (see lib/api/auth/token.ts).
 */
declare module "next-auth" {
  interface Session {
    accessToken?: string
    role?: "USER" | "ADMIN"
    /**
     * AUTH-004 — set when the refresh token could not be traded for a new
     * pair, which means the session is over rather than merely stale.
     * `SessionWatch` reads it and sends the browser to the login page.
     */
    error?: "RefreshFailed"
    user: {
      id: string
    } & DefaultSession["user"]
  }

  interface User {
    accessToken?: string
    refreshToken?: string
    role?: "USER" | "ADMIN"
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string
    refreshToken?: string
    role?: "USER" | "ADMIN"
    error?: "RefreshFailed"
  }
}


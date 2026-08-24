import type { DefaultSession } from "next-auth"

/**
 * The API's tokens ride along on the session so every existing caller can keep
 * asking for a bearer token the way it always has (see lib/api/auth/token.ts).
 */
declare module "next-auth" {
  interface Session {
    accessToken?: string
    role?: "USER" | "ADMIN"
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
  }
}


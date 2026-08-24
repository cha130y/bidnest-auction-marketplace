/**
 * SRS §3 requires NextAuth (Auth.js) for client-side session management —
 * not yet installed anywhere in this repo as of 2026-08-24 (setting it up is
 * AUTH-008, owned by Dev 1: SessionProvider, the actual sign-in provider(s),
 * and the login page). This file is the contract the rest of the app needs
 * from that session, written down *before* NextAuth lands so both sides can
 * agree on the shape without blocking on each other.
 *
 * Everywhere else in apps/web only ever calls `authHeader()` or
 * `useAuthToken()` (see token.ts / use-auth-token.ts) — never `localStorage`
 * directly (verified by grep across all 17 current call sites). That means
 * migrating off localStorage is a two-file change, not a twelve-file one:
 * only `authHeader()`'s and `useAuthToken()`'s *internals* need to start
 * reading from this session instead, as long as they keep returning the same
 * shapes (`Record<string,string>` and `{ token, ready }` respectively) that
 * every consumer already expects.
 *
 * The one thing that *is* a real shift: `getAuthToken()` today is a
 * synchronous `localStorage.getItem` call. A NextAuth session is inherently
 * async off the client-render path (`getSession()`) — so `authHeader()` (and
 * therefore `apiFetch()` in lib/api/client.ts) will need to become async.
 * `useAuthToken()` will not: `useSession()` is already a hook returning
 * `{ data, status }`, so useAuthToken() can just re-shape that into
 * `{ token, ready }` and every existing caller keeps working unchanged.
 *
 * 🔌 What we need from Dev1's NextAuth config once it exists:
 * `session.accessToken` must be our own backend's existing access token —
 * the exact JWT `AccessTokenGuard` already accepts today (signed with
 * `JWT_ACCESS_SECRET`, `sub` claim = user id — the same token
 * `POST /auth/login` + `POST /auth/2fa/verify` return, and the same shape
 * `bearerFor()` mints in apps/api/test/helpers/auth.ts). NextAuth's own
 * session token and our API's access token are two different things; only
 * this one is useful to `apiFetch()`. Whatever provider Dev1 picks
 * (Credentials wrapping our own /auth/login+OTP flow, or NextAuth's own
 * Google/Line OAuth), the `jwt`/`session` callbacks need to end up putting
 * that backend token here.
 *
 * Not a `declare module "next-auth"` augmentation yet — the package isn't
 * installed, so that would not compile. Add that augmentation (extending
 * `next-auth`'s own `Session` interface with this shape) in the same PR that
 * installs `next-auth`.
 */
export interface AuthSession {
  accessToken: string;
}

# Dev 2 — Backend Core & Security Checklist

> **References:** SRS v7 (`docs/requirements/BidNest-Auction and Marketplace-v7.pdf`) and Team Role Distribution v2
> **Requirements owned:** `AUTH-001..008`, `USR-001`, `ADM-003`, `§6 (Security & Quality)`
> **Branch:** `feat/auth-dev2` → PRs into `dev` only
> **Scope of work:** NestJS setup, the main Prisma schema + migrations for the whole team, the entire authentication system, shared categories, overall security

## Status (Aug 24, 2026)

All the requirements Dev 2 owns — `AUTH-001..008`, `USR-001`, `ADM-003` — **are done and merged into `dev`**, confirmed by 703 unit cases and 417 e2e cases

**Every item in this list is ticked.** The last one — the privacy interceptor (§6) — was finished as `SensitiveFieldsInterceptor`, a global interceptor that inspects every response before it leaves the server

It has 2 levels, because they are different contracts:

| Level | fields | opt-out |
|---|---|---|
| **NEVER** | `passwordHash`, `refreshTokenHash`, `codeHash`, `tokenHash`, `resetTokenHash` | None — nobody may read a digest back, not even the account owner or an admin |
| **OWNER_ONLY** | `reservePrice` (AUC-003), `negotiationFloor` (PROD-006) | Routes where the caller really is the owner get `@ReturnsOwnerFields()` |

What happens when one is found: **in tests it throws** (if it only logged, the leak would still reach production), while in dev/production it **strips the field + logs the route name**, so real requests lose quality rather than lose secrets

**It doesn't replace the mappers** — the mappers of Dev 3/4 are still the main line of defense, and `auction.mapper` even fails to build if `reservePrice` appears in a public type. This is **a safety net for routes nobody has written yet** — new endpoints that return rows straight from Prisma without a mapper

**Limitation to know:** routes that decide ownership *per row* (e.g. `GET /auctions/:id`, which returns the reserve only to the seller) have to use `@ReturnsOwnerFields()`, which means the net doesn't cover that route — there it still relies on mappers and tests as before

### Still pending, but not code work

- Gmail App Password in `apps/api/.env` (`MAIL_PASSWORD` is still empty → login doesn't work yet)
- LINE `LINE_CHANNEL_SECRET` + Callback URL at developers.line.biz (the LINE button stays hidden until they're set)
- Add Test users in Google Cloud Console if other people need to log in with Google

### To raise with the code owners

| Who | Issue |
|---|---|
| Dev 5 | `AI_NEGOTIATOR_JWT_SECRET` still has `.default('dev-negotiator-secret-change-me')` — deploying like this means anyone can forge tokens |
| Dev 5 | `DevTokenSwitcher` is in the `/admin` layout, but `proxy.ts` guards `/admin` → the user-switch button can't be reached before logging in; it should move to the root layout |
| Dev 1 | The hamburger button on mobile still doesn't respond (nobody passes `onMenuToggle` in), so the 6-category menu is unreachable on small screens |
| Dev 4/5 | 4 leftover `TODO(Dev …)` in `admin/*.controller.ts`, even though `@Roles('ADMIN')` is already fully in place |

---

## 0. Infrastructure & Setup

Steps 1–4 and 6 of the Kickoff Guide are Dev 2's responsibility (see `docs/KICKOFF_GUIDE.md`)

- [x] Git repo + branch strategy (`main` / `dev` / `feat/*`)
- [x] Monorepo scaffold — `apps/web`, `apps/api`, `packages/contracts`, `packages/config` (pnpm workspace)
- [x] Docker Compose — PostgreSQL (port `5433`) + Maildev (port `1080`)
- [x] Initial Prisma schema + first migration (`20260815173946_init_migration`)
- [x] Basic CI — lint + test on PRs (`.github/workflows/`)
- [x] `PrismaModule` + `PrismaService` (injectable, global) in `apps/api/src/prisma/`
- [x] `ConfigModule` + env validation (building on `apps/api/src/config/env.vaildation.ts`)
- [x] Global `ValidationPipe` (class-validator, `whitelist: true`) in `main.ts`
- [x] Global exception filter — error responses don't leak implementation details (§6)
- [x] Swagger setup (`@nestjs/swagger`) — the SRS requires the REST API to be documented with Swagger

---

## 1. AUTH-001 — Local registration

- [x] `POST /auth/register`
- [x] Required: first name, display name, email (unique), password — last name is optional
- [x] Hash the password securely (bcrypt / argon2) before saving to `users.password_hash`
- [x] Create `user_profiles` together in the same transaction
- [x] DTO + class-validator (email format, password strength, field lengths per the schema)

---

## 2. AUTH-002 — Local login (2 steps)

- [x] `POST /auth/login` — checks email/password
- [x] Accounts with `status != ACTIVE` (SUSPENDED / DEACTIVATED) are rejected at the first step
- [x] If it passes → create an OTP + send the email → return a **"pending verification"** status, **without issuing a token yet**
- [x] Second request (same login details + a correct, unexpired OTP) → issue an access token + refresh session

> ⚠️ **Important note:** the NextAuth Credentials provider calls `authorize()` only once
> The client side (Dev 1) collects password + OTP in 2 steps on screen, then sends them together in a single `signIn()`
> → the endpoint has to be designed to support both 2 separate calls and a combined call (**talk to Dev 1 before starting**)

---

## 3. AUTH-007 — 2FA with an emailed OTP (mandatory for every account, every login path)

- [x] `POST /auth/2fa/verify` — verify the OTP → issue an access token + refresh session
- [x] `POST /auth/2fa/resend` — request a new code
- [x] 6-digit code, single use, **hashed before saving** to `two_factor_codes.code_hash`
- [x] Expires after a set time (e.g. 10 minutes) — invalidated as soon as it is used successfully or expires
- [x] Rate-limit resend requests (e.g. 1 per 60 seconds)
- [x] Enforced for **every login method** — local (AUTH-002), Google (AUTH-003), Line (AUTH-006)
- [x] Backup/recovery codes are **out of scope for V1**

---

## 4. AUTH-003 / AUTH-006 — Google & Line OAuth

- [x] `POST /auth/google/callback` — 1 Google account links to only 1 platform account
- [x] `POST /auth/line/callback` — Line only needs the Line user ID; **email is optional** (Line may not send it)
- [x] Identify primarily by the `provider + provider_account_id` pair (`auth_accounts` already has `@@unique`)
- [x] ❌ **Never link accounts based solely on matching an unverified email**
- [x] OAuth must always go through the same OTP step as AUTH-007 before issuing a session (no provider may skip it)

---

## 5. AUTH-004 — Refresh Session

- [x] `POST /auth/refresh` — hash the incoming refresh token and compare it with `user_sessions.refresh_token_hash`
- [x] Check `expires_at > now()` and `revoked_at IS NULL`
- [x] `POST /auth/logout` — set `revoked_at` (revoke the session)
- [x] Store only the ID, user, hash, expiry, revocation status and creation time — **no other fields**
- [x] `user_sessions` is the single source of truth — the NextAuth side only holds a copy in a cookie
- [x] Agree with Dev 1 on whether to rotate refresh tokens (affects the NextAuth session callback)

---

## 6. AUTH-005 — Password recovery

- [x] `POST /auth/forgot-password` — send a single-use reset link to the registered email
- [x] ✅ The response **must always be identical**, whether or not the email exists (prevents user enumeration)
- [x] `POST /auth/reset-password` — check the token hash, not yet used, not expired (e.g. 30 minutes)
- [x] After successfully setting a new password → **immediately revoke all of this account's existing refresh sessions** (forces a new login on every device)
- [x] ❌ Reset tokens **must never appear in API responses or production logs**
- [x] Uses `password_reset_tokens` (same pattern as `two_factor_codes`)

---

## 7. AUTH-008 — Protected Routes (NestJS Guard side)

- [x] `JwtAuthGuard` — checks the access token on **every incoming request** (doesn't rely on Next.js middleware)
- [x] `RolesGuard` + `@Roles('ADMIN')` decorator for USER/ADMIN
- [x] `@Public()` decorator for public endpoints (catalog, auction list, etc.)
- [x] Hand the guard/decorator contract to Dev 3, 4, 5 (**it blocks the team — finish it fast**)

---

## 8. USR-001 — User profile

- [x] `GET /users/me` — my own profile data
- [x] `PATCH /users/me` — first/last name, display name, avatar, bio, phone, address, default shipping address
- [x] The default shipping address is used to prefill e-commerce checkout (called by Dev 3)
- [x] Public pages show only the **display name or a masked name** — real names/emails must never leak

---

## 9. ADM-003 — Shared category management (Admin)

One category set shared by both Auction and E-commerce

- [x] `GET /categories` — public (Guests can view), filtered to `is_active = true` for the user side
- [x] `POST /categories` — create (ADMIN only)
- [x] `PATCH /categories/:id` — edit (ADMIN only)
- [x] `PATCH /categories/:id/activate` / `deactivate` — activate/deactivate
- [x] ❌ Categories already in use are **only deactivated, never permanently deleted**
- [x] Record `admin_actions` every time (`CREATE_CATEGORY` / `UPDATE_CATEGORY` / `ACTIVATE_CATEGORY` / `DEACTIVATE_CATEGORY`)
- [x] Seed starter categories for the team to use in dev (`prisma/seed.ts`)

---

## 10. §6 — Security & Quality (overall responsibility)

### Hashing & Secret
- [x] hash: passwords, refresh tokens, OTP codes, reset tokens — **every one of them before saving to the DB**
- [x] ❌ Never log OTP codes or reset tokens in plain text
- [x] ❌ Never commit `.env` or hardcode secrets/API keys

### Validation & Authorization
- [x] Validate every external input (class-validator + DTO)
- [x] Always enforce permission checks on the server, not just in the UI
- [x] Every request to the API must have its token re-checked by NestJS (AUTH-008)

### Rate Limiting (`@nestjs/throttler`)
- [x] login
- [x] OTP verification / resend
- [x] Hand guidelines + shared config to Dev 4 (bid submission) and Dev 5 (AI requests)

### Data Privacy — must never leak
- [x] `auctions.reserve_price` (AUC-003)
- [x] `products.negotiation_floor` (PROD-006)
- [x] Other users' bidder personal data / carts / orders
- [x] Written as a central interceptor or serialization rule for the whole team (`SensitiveFieldsInterceptor`)

### Email Delivery
- [x] `MailService` is a single interface — dev uses Maildev, production uses a real SMTP relay
- [x] ❌ Maildev **must never be reachable from the production network** (its dashboard exposes every OTP without authentication)

### Testing & Docs
- [x] Unit test: auth service, guard, hashing
- [x] E2E test: flow register → login → OTP → refresh → logout
- [x] Swagger covers every endpoint of `/auth`, `/users`, `/categories`

---

## Endpoint summary (per SRS §5.2)

| Method | Endpoint | Requirement |
|---|---|---|
| POST | `/auth/register` | AUTH-001 |
| POST | `/auth/login` | AUTH-002 |
| POST | `/auth/2fa/verify` | AUTH-007 |
| POST | `/auth/2fa/resend` | AUTH-007 |
| POST | `/auth/google/callback` | AUTH-003 |
| POST | `/auth/line/callback` | AUTH-006 |
| POST | `/auth/refresh` | AUTH-004 |
| POST | `/auth/logout` | AUTH-004 |
| POST | `/auth/forgot-password` | AUTH-005 |
| POST | `/auth/reset-password` | AUTH-005 |
| GET / PATCH | `/users/me` | USR-001 |
| GET / POST / PATCH | `/categories` | ADM-003 |

---

## Coordination points with the team

| With | Topic |
|---|---|
| **Dev 1** | The payload shape the NextAuth credentials provider sends (password + OTP in one call), JWT payload shape, refresh token rotation |
| **Dev 3 / Dev 4** | The `JwtAuthGuard` / `RolesGuard` / `@Public()` contract, shared DTOs in `packages/contracts`, rate-limit config |
| **Dev 5** | `@Roles('ADMIN')` for ADM-002 / ADM-004, the pattern for recording `admin_actions` |
| **Everyone** | Changes to `schema.prisma` must always be raised with Dev 2 first — Dev 2 owns the migrations |

---

## Priorities (14 days)

**Week 1 — unblock the team (do first)**
1. `PrismaService` + `ConfigModule` + `ValidationPipe` + Swagger
2. AUTH-001, AUTH-002 (basic local login + JWT)
3. AUTH-008 guards → **hand to the team as soon as done** (Dev 3/4/5 are waiting on mock auth)

**End of week 1**
4. AUTH-007 (OTP + MailService), AUTH-004 (refresh / logout)
5. ADM-003 categories + seed → Dev 3/4 need them to reference categories

**Week 2**
6. AUTH-003, AUTH-006 (OAuth), AUTH-005 (reset password)
7. USR-001 profile
8. §6 hardening — rate-limit, privacy interceptor, test coverage

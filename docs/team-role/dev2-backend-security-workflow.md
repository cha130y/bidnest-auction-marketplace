# Dev 2 — Backend Core & Security Workflow (slash command template)

> **Approach owner:** Dev 2 (Backend Core & Security)
> **What this file is:** a copy of the personal slash command `/dev2` actually in use, put in the repo as **a template for teammates to copy and adapt as their own**
> **Not a team rule** — the rules the whole team shares live only in `CLAUDE.md`; this file is a personal approach, adjust it as you like
> **Pairs with:** `docs/team-role/dev2-checklist.md` (a detailed per-item checklist) and `docs/team-role/dev4-auction-workflow.md` (Dev 4's template)
> **References:** SRS v7, Team Role Distribution v2

---

## How to use it

1. Create the file `.claude/commands/<name-you-want>.md` on your own machine (e.g. `dev2.md`)
2. Copy the content of the block below into it, then adapt it to your own requirements / module
   - Change `description:` in the frontmatter
   - Change the requirement list under "Requirement order"
   - Change/remove the "Coding rules" items that are specific to auth/security (items 4–8)
3. Invoke it with `/<that name>` when talking to Claude Code

`.gitignore` already excludes `.claude/*`, so the command file on your machine won't reach git and won't affect anyone

---

## Template content (copy the whole block, including the frontmatter)

```markdown
---
description: Implement Dev 2's Auth and Security requirements one at a time, stopping to test and asking before committing
---

# Dev 2 Workflow — Backend Core & Security

Work through the following requirements **one at a time** — never bundle several requirements into one round

## Reference documents (read before every start)

- SRS: `docs/requirements/BidNest-Auction and Marketplace-v7.pdf` — use each requirement's **"Acceptance criteria"** cell to decide whether it passes, and **§6** as the security criteria
- Team role: `docs/team-role/Team-role-dustribution-v2.pdf`
- My own checklist: `docs/team-role/dev2-checklist.md` — tick off progress here
- Schema: `apps/api/prisma/schema.prisma` — **Dev 2 owns this file and all migrations**
- ADR: `docs/architecture/adr/` — ADR-0001 (one shared admin/category set), ADR-0002 (product state machine)
- Reference repo: https://github.com/cha130y/cbeave-auction-platform (can be read via `gh api`, no need to clone)

## Requirement order (per Dev 2's Team-role)

Work in this order, which puts the things "others are waiting on" first

1. **AUTH-002 + AUTH-007** — local login + emailed OTP **must be done together**, because 2FA is mandatory for every account; there is no way to log in without verifying the OTP
2. **AUTH-008** — the real `JwtAuthGuard` + `RolesGuard` ← **unblocks the whole team, do it as early as possible** (see rule 6)
3. **AUTH-004** — refresh session + logout (revoking tokens)
4. **AUTH-005** — password recovery via a single-use link
5. **AUTH-003 + AUTH-006** — Google OAuth and Line OAuth (both must pass OTP before issuing a session)
6. **USR-001** — user profile + default shipping address (Dev 3 uses it to prefill checkout)
7. **ADM-003** — shared category management (scaffold already at `apps/api/src/categories/`)
8. **§6** — final hardening round: rate-limiting, privacy interceptor, test coverage

**AUTH-001** (registration) is already done, in `apps/api/src/auth/`

If a requirement has already been done, skip it and say why it was skipped

## Coding rules

1. **bidnest's structure comes first** — this repo's folder structure, naming and conventions always take priority
2. **cbeave is a reference, not something to copy-paste** — look at the patterns (module structure, strategy/guard, issuing tokens) and adapt them to bidnest

   ⚠️ cbeave and bidnest **are not the same** — cbeave uses the `FACEBOOK` provider while bidnest uses `LINE` (and Line may not send an email at all, so identify users by `provider + provider_account_id` only), and bidnest enforces 2FA on every login path, which cbeave doesn't have. Copying directly will break; always check against bidnest's `schema.prisma`
3. **`schema.prisma` — Dev 2 owns it, but still has to tell the team before changing it** (per CLAUDE.md), because everyone shares it. Always commit the migration files together with it; never commit `schema.prisma` alone without a migration
4. **Hash every secret before it goes into the DB** — passwords, OTP codes, refresh tokens, reset tokens (SRS §6). Use the existing `HashingService`; don't create a second one
5. **Never log the raw value of an OTP / reset token / password / refresh token**, at any log level, and never return a reset token in an API response (AUTH-005, §6)
6. **AUTH-008 only replaces `MockAuthGuard` — don't change the contract** — Dev 4 built `apps/api/src/common/guards/mock-auth.guard.ts` as a temporary stand-in, and every controller of Dev 3/4/5 is already bound to `@CurrentUser()`, `@Public()`, `@Roles()` and the `AuthenticatedUser` type. Our job is only to change how identity is established, from the `x-mock-user-id` header to a Bearer token. **Renaming a decorator or changing the shape of `AuthenticatedUser` breaks the code of the other 3 people** — if you think a change is truly necessary, propose it and wait for an answer
7. **AUTH-005 must never reveal whether an email exists in the system** — the response must be exactly the same in every case: message, status code and response time (prevents user enumeration)
8. **Never write code on behalf of other devs** — if a requirement depends on someone else's code, first check the code for whether the real thing exists yet; if not, mock it or leave it empty and wait for them. Don't build it for them, and report which parts can't be tested and what they are waiting on

## When each requirement is done — stop first

**Don't start the next requirement right away**; do this:

1. Write/run tests that check the requirement meets **every acceptance criterion in the SRS**
   - Use mock data or seed data as appropriate
   - Auth work needs both unit tests (service, guard, hashing) and e2e tests hitting real HTTP
   - Emails the system sends (OTP, reset link) can be checked in Maildev at `http://localhost:1080`
   - If there is already frontend UI, test **both frontend and backend together**
   - Make `pnpm check` pass too (typecheck + test + lint)
   - ⚠️ `apps/api/generated/prisma` is gitignored; if lint floods you with `no-unsafe-*`, run `pnpm --filter api exec prisma generate` first
2. Report the test results truthfully — which pass, which fail, which haven't been tested and why
3. **Ask first whether it is ready to commit + push**, and wait for the answer
4. If the answer is yes → commit + push + draft the PR title/description in the format from CLAUDE.md
   - commit message: `<type>(<requirement-id>): <short English description>`
   - PR base = always `dev`
   - **Never create/merge the PR yourself** — send the URL and text for the user to click
```

# Dev 4 — Auction Workflow (slash command template)

> **Approach owner:** Dev 4 (Auction Module & Real-time)
> **What this file is:** a copy of the personal slash command `/dev4` actually in use, put in the repo as **a template for teammates to copy and adapt as their own**
> **Not a team rule** — the rules the whole team shares live only in `CLAUDE.md`; this file is a personal approach, adjust it as you like
> **Use together with:** [`dev4-commit-workflow.md`](./dev4-commit-workflow.md) — this file covers only **build + test** and ends at the question "ready to commit?"; the **ship** steps (commit / push / PR) are in the other file
> **References:** SRS v7, Team Role Distribution v2

---

## How to use it

1. Create the file `.claude/commands/<name-you-want>.md` on your own machine (e.g. `dev3.md`)
2. Copy the content of the block below into it, then adapt it to your own requirements / module
   - Change `description:` in the frontmatter
   - Change the requirement list under "Requirement order"
   - Change/remove the "Coding rules" items that are specific to the auction side (items 4–6)
3. Invoke it with `/<that name>` when talking to Claude Code

`.gitignore` already excludes `.claude/*`, so the command file on your machine won't reach git and won't affect anyone

---

## Template content (copy the whole block, including the frontmatter)

```markdown
---
description: Implement Dev 4's Auction requirements one at a time, stopping to test and asking before committing
---

# Dev 4 Workflow — Auction Module & Real-time

Work through the following requirements **one at a time** — never bundle several requirements into one round

## Reference documents (read before every start)

- SRS: `docs/requirements/BidNest-Auction and Marketplace-v7.pdf` — use each requirement's **"Acceptance criteria"** cell to decide whether it passes
- Team role: `docs/team-role/Team-role-dustribution-v2.pdf`
- Schema: `apps/api/prisma/schema.prisma`
- ADR: `docs/architecture/adr/` — ADR-0001 (one shared admin/category set), ADR-0002 (product state machine)
- Reference repo: https://github.com/cha130y/cbeave-auction-platform (can be read via `gh api`, no need to clone)

## Requirement order (per Dev 4's Team-role)

1. **AUC-001..008** — auction lifecycle: draft → validate → preview/publish → scheduled → edit/cancel → auction end → Hot Auctions
2. **BID-001..005** — bidding: validation, atomicity/idempotency, realtime broadcast, anti-sniping, bid history
3. **LIV-001..005** — Live Arena: lobby, arena, sudden death, results
4. **WAT-001/002** — Watchlist
5. **NOT-001..004** — auction-side notifications: Outbid / Won / Ended / Cancelled
6. **ADM-001** — Admin cancels auctions (scaffold already at `apps/api/src/admin/auctions.controller.ts`)

If a requirement has already been done, skip it and say why it was skipped

## Coding rules

1. **bidnest's structure comes first** — this repo's folder structure, naming and conventions always take priority
2. **cbeave is a reference, not something to copy-paste** — look at the patterns (module structure, use of `$transaction`, splitting dto/mappers/queries/types) and adapt them to bidnest

   ⚠️ cbeave and bidnest **have different schemas** — cbeave is auction-only with no e-commerce and uses the `FACEBOOK` provider while bidnest uses `LINE`, and some field/relation names differ. Copying directly will break; always check against bidnest's `schema.prisma`
3. **Never edit `schema.prisma` without asking first** (per CLAUDE.md) — if a change is really needed, propose it with the reasoning and wait for an answer
4. Every admin write must write `admin_actions` in the same `$transaction` (ADM-004)
5. Never broadcast an event before the transaction commits (SRS §6)
6. Never send `reservePrice` out of buyer-facing APIs — only the computed `reserveMet` may be sent (AUC-003)
7. **Never write code on behalf of other devs** — if a requirement depends on someone else's code, first check the code for whether the real thing exists yet; if not, mock it or leave it empty and wait for them. Don't build it for them, and report which parts can't be tested and what they are waiting on

## When each requirement is done — stop first

**Don't start the next requirement right away**; do this:

1. Write/run tests that check the requirement meets **every acceptance criterion in the SRS**
   - Use mock data or seed data as appropriate
   - If there is already frontend UI, test **both frontend and backend together**
   - Make `pnpm check` pass too (typecheck + test + lint)
2. Report the test results truthfully — which pass, which fail, which haven't been tested and why
3. **Ask first whether it is ready to commit + push**, and wait for the answer
4. If the answer is yes → call `/commit <requirement-id>` (e.g. `/commit AUC-003`) and follow it

All the ship steps (checking git status, drafting the commit message, pushing, checking for open PRs,
assembling the PR form URL) live in `.claude/commands/commit.md` **in one place only** — don't repeat them in this file,
because if you edit one and forget the other, the two files drift apart
```

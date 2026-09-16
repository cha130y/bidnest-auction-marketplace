# Dev 3 — E-Commerce Workflow (slash command template)

> **Approach owner:** Dev 3 (E-Commerce Module)
> **What this file is:** a copy of the personal slash command `/dev3` actually in use, put in the repo as **a template for teammates to copy and adapt as their own**
> **Not a team rule** — the rules the whole team shares live only in `CLAUDE.md`; this file is a personal approach, adjust it as you like
> **Use together with:** [`dev3-commit-workflow.md`](./dev3-commit-workflow.md) — this file covers only **build + test** and ends at the question "ready to commit?"; the **ship** steps (commit / push / PR) are in the other file
> **References:** SRS v7, Team Role Distribution v2 · written alongside `dev4-auction-workflow.md`

---

## How to use it

1. Create the file `.claude/commands/<name-you-want>.md` on your own machine (e.g. `dev3.md`)
2. Copy the content of the block below into it, then adapt it to your own requirements / module
   - Change `description:` in the frontmatter
   - Change the requirement list under "Requirement order"
   - Change/remove the "Coding rules" items that are specific to e-commerce (items 4–10)
3. Invoke it with `/<that name>` when talking to Claude Code

`.gitignore` already excludes `.claude/*`, so the command file on your machine won't reach git and won't affect anyone

---

## Template content (copy the whole block, including the frontmatter)

````markdown
---
description: Implement Dev 3's E-Commerce requirements one at a time, stopping to test and asking before committing
---

# Dev 3 Workflow — E-Commerce Module

Work through the following requirements **one at a time** — never bundle several requirements into one round

## Reference documents (read before every start)

- SRS: `docs/requirements/BidNest-Auction and Marketplace-v7.pdf` — use each requirement's **"Acceptance criteria"** cell to decide whether it passes
- Team role: `docs/team-role/Team-role-dustribution-v2.pdf`
- Schema: `apps/api/prisma/schema.prisma`
- ADR: `docs/architecture/adr/` — ADR-0001 (one shared admin/category set), ADR-0002 (product state machine + `SUSPENDED`)
- Reference repo: https://github.com/cha130y/cbeave-auction-platform (can be read via `gh api`, no need to clone)

## Requirement order (per Dev 3's Team-role)

1. **PROD-001..007** — product catalog: create/edit/delete, search + filter, detail, stock, negotiation floor, quantity discount
2. **CART-001..005** — cart + simulated checkout: add/edit, split orders per seller, simulated payment, order confirmation
3. **SHIP-001..003** — shipping + history: seller updates status, buyer views the timeline, history for both sides
4. **NOT-005/006/007** — order-side notifications: Order Placed / Shipment Update / Delivered
5. **ADM-005/006** — Admin for my own module only: suspend/reactivate product listings, order overview (in `apps/api/src/admin/products.*` and `orders.*`)
6. **CHAT-001..003 + NOT-008** *(Optional)* — buyer-seller chat, only after all the required features are finished

If a requirement has already been done, skip it and say why it was skipped

## Coding rules

1. **bidnest's structure comes first** — this repo's folder structure, naming and conventions always take priority
2. **cbeave is a reference, not something to copy-paste** — look at the patterns (module structure, use of `$transaction`, splitting dto/mappers/queries/types) and adapt them to bidnest

   ⚠️ cbeave **has no e-commerce module at all** — it is auction-only, with no products/cart/orders/shipments, so Dev 3 can't copy its structure directly; only structural patterns are usable. Always check against bidnest's `schema.prisma`
3. **Never edit `schema.prisma` without asking first** (per CLAUDE.md) — if a change is really needed, propose it with the reasoning and wait for an answer
4. **Never send `negotiationFloor` out of buyer-facing APIs** (PROD-006, SRS §6 — the same rule as `reservePrice` on the auction side)

   The approach in use: `productOwnerSelect` **extends** `productPublicSelect`, not the other way around (see `product.mapper.ts`), so the buyer-side path **can't leak by forgetting**, because secret fields have to be added deliberately
5. **All money uses `Prisma.Decimal`, never float** — from product prices and discounts to cart totals and order totals. Keep money logic in pure functions so it can be unit tested (see `cart/utils/calculate-line-total.util.ts`)
6. **Deduct stock with a conditional `updateMany` and check `count`** — never read, add/subtract, and write back (PROD-005)

   ```ts
   const { count } = await tx.product.updateMany({
     where: { id, status: 'ACTIVE', stockQty: { gte: qty } },
     data: { stockQty: { decrement: qty } }
   });
   if (count !== 1) throw new ConflictException(...); // lost the race → roll back the whole thing
   ```
   The same pattern is used for advancing shipment status
7. **Never emit realtime events / create side effects before the transaction commits** (SRS §6) — fire events only after `$transaction` has returned, otherwise you'd notify about orders that were rolled back
8. **Every payment must be recorded, whatever the outcome** — 1 row per `checkout_session_id` (not per order), committed separately before creating orders, so a charge isn't lost on rollback (CART-004)
9. **Outsiders must get 404, not 403** — orders, chats and non-public products must not reveal to outsiders that they exist (SRS §6); 403 is for people who **can see it but can't act on it**, e.g. a buyer trying to change shipment status
10. **Keep clear who owns a product status** (ADR-0002)
    - `INACTIVE` = paused by the seller; the seller can reopen it
    - `SUSPENDED` = suspended by an admin (ADM-005); **the seller can't lift it by any route** — editing the price, changing the status and restocking must all get 403
    - `OUT_OF_STOCK` = computed by the system from stock; never let anyone set it
    - `REMOVED` = terminal, only from DELETE; if orders reference the product, degrade to `INACTIVE` instead (PROD-002)
11. **A negotiated price (AI-003) must not stack with the quantity discount** (PROD-007) — when a negotiated price is used, **skip** that line's quantity discount entirely rather than discounting twice
12. **`shipment_events` is append-only** — never update old rows (SHIP-001 — same pattern as `auction_events`)
13. **The cart must not freeze prices** (CART-002) — store only product + quantity; every total is computed live from the seller's current price on every read
14. **Never write code on behalf of other devs** — if a requirement depends on someone else's code, first check the code for whether the real thing exists yet; if not, mock it or leave it empty and wait for them. Don't build it for them, and report which parts can't be tested and what they are waiting on

## Things mocked while waiting for other devs

Designed so that **switching to the real thing needs no controller changes at all**

| Mock | Waiting on | How to switch | Status |
|---|---|---|---|
| ~~`MockAuthGuard`~~ | Dev 2 — AUTH-008 | Change `useClass` in one place, `app.module.ts` | ✅ **Switched** to `AccessTokenGuard` · not a single controller file changed |
| `RealtimeService` (`realtime/`) | Dev 4 — WebSocket gateway | Change only the bodies of the 3 methods to call `server.to(room).emit(...)` | ⏳ Still a stub — just logs to the console for now |
| `MockPaymentProvider` (`payment/`) | **Not waiting on anyone** | — | ♾️ A permanent mock per SRS §1.2 — V1 doesn't connect a real payment gateway |

⚠️ The real guard is registered as a **global `APP_GUARD`** as before, which means every new route needs `@Public()` if it should be reachable without logging in, otherwise it returns 401

**Lesson from the actual switch:** controller/service code needed no changes because it reads identity only through `@CurrentUser()` — but **everything outside the code had to be chased down**: 7 `.http` files (82 spots), the Postman collection (67 spots), the README and comments naming the old guard. When planning a mock next time, count these into the cost of switching

## When each requirement is done — stop first

**Don't start the next requirement right away**; do this:

1. Write/run tests that check the requirement meets **every acceptance criterion in the SRS**
   - Add cases to `apps/api/test/ecommerce.e2e-spec.ts` for invariants that hurt when broken (floor secrecy, overselling stock, a failed payment creating nothing, shipment order, access rights)
   - e2e must **create its own data inside the file, never rely on the seed**, and clean everything up in `afterAll` — prove it by running 2–3 times and checking the DB row counts return to the same values
   - If there is already frontend UI, test **both frontend and backend together**
   - Make `pnpm check` pass too (typecheck + test + lint)
2. Report the test results truthfully — which pass, which fail, which haven't been tested and why
3. **Ask first whether it is ready to commit + push**, and wait for the answer
4. If the answer is yes → call `/commit <requirement-id>` (e.g. `/commit PROD-006`) and follow it

All the ship steps (checking git status, drafting the commit message, pushing, checking for open PRs,
assembling the PR form URL) live in `.claude/commands/commit.md` **in one place only** — don't repeat them in this file,
because if you edit one and forget the other, the two files drift apart
````

---

## Extra notes for anyone adapting this

- **`pnpm test` doesn't run e2e yet** — jest is set to `rootDir: "src"` while the e2e files are in `test/`, so `pnpm --filter api test:e2e` has to be run separately. Having CI run it too would mean adding a `postgres` service to the workflow, a file shared by the whole team, so agree on it first
- **After every `git merge dev`, compare `apps/api/.env` with `.env.example`** — if there is a new variable (e.g. `JWT_ACCESS_SECRET`) you haven't filled in yet, the API won't even start at boot

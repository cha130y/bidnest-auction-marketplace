# ADR-0001 — One Admin role and one shared category set for both modules

- **Status:** Accepted
- **Date:** 2026-08-19
- **References:** SRS v4 §1.1, §2, §4.4, §5.1, §5.2, ADM-001..006
- **Concerns:** Dev 2 (ADM-003), Dev 3 (ADM-005/006), Dev 4 (ADM-001), Dev 5 (ADM-002/004)

---

## Context

BidNest has 2 business modules that work independently of each other — **Auction** (real-time auctions) and **E-commerce** (fixed-price buying and selling) — under a single account system.

When work reached the Admin side (ADM-001..006) and category management (ADM-003), the team kept coming back to 2 questions:

1. Should Admin be split into an "Auction Admin" and an "E-commerce Admin"?
2. Should categories be split into a separate set per module?

These questions came from 2 practical concerns: (a) requirements ADM-001..006 are spread across 4 devs, raising fears of editing the same files, and (b) some categories may suit one module better than the other.

This document records the decision so it does not have to be debated again, and so people reading the code later understand why it was designed this way.

---

## Decision

### 1. One Admin role — not split per module

`UserRole` stays at just `USER` and `ADMIN`; no `AUCTION_ADMIN` / `ECOMMERCE_ADMIN` is added

### 2. One shared category set — no `scope` field

A single `categories` table; both `auctions` and `products` reference the same table, with no per-module scoping at the data level

### 3. Split by "file", not by "role"

The concern about editing the same files is solved by splitting controllers per requirement so each person has their own files (see the "Agreed structure" section)

---

## Rationale

### The SRS already states both points clearly

On categories, the SRS says it in 3 places:

| Reference | Text |
| --- | --- |
| §1.1 | "A **single** category set managed by the Admin, shared by both Auction and E-commerce" |
| §4.4 | "The product catalog uses the shared category set (ADM-003) **rather than a separate set**, so the Admin manages just one category list for both modules instead of two" |
| §5.1 | "categories are shared by both modules, **not scoped per module**; listings in each domain may only reference active categories" |

On the Admin role:

- **§2** The access-rights table lists Administrator as a **single row**, with duties spanning both modules — view statistics, manage categories, suspend/reactivate users, cancel auctions, suspend/reactivate product listings, view the order overview, view the audit history
- **§5.1 Identity** — "the recorded role is USER/ADMIN"
- **§5.2** — defines the REST endpoint group as a **single** `/admin`, not split into `/admin/auction` and `/admin/shop`

### The current schema already supports it, no changes needed

`apps/api/prisma/schema.prisma` matches this decision everywhere:

- `enum UserRole { USER ADMIN }` — no per-module admin
- `model Category` — **no `scope` field**, with both `auctions Auction[]` and `products Product[]` pointing at the same table
- `model AdminAction` — has FKs for all 4 targets on the same row (`targetUserId`, `auctionId`, `categoryId`, `productId`), making it a **single-table** audit trail that serves both modules per ADM-004
- `enum AdminActionType` — already covers ADM-001..005 (ADM-006 is read-only, so it needs no action type)

### In V1 the cost of splitting outweighs the benefit

Splitting Admin into 2 roles would cost:

- Changing the `UserRole` enum + a migration, against the team's agreement not to change the schema without agreeing first
- `admin_actions` would have to be queried per role, defeating the purpose of ADM-004 being designed as one audit trail
- 2 sets of screens/menus/guards, even though V1 has no user reporting system or dispute queue yet (SRS §1.2 has deferred both), so there isn't enough admin work to need separate teams

Splitting the category set would cost: the Admin maintaining 2 sets, and overlapping categories (e.g. "Watches") having to be created twice and possibly drifting apart — exactly the problem §4.4 explicitly chose to avoid

---

## Agreed structure

### API

`categories` **is not under `admin/`**, because `GET /categories` is a public endpoint that guests need for filtering the catalog (PROD-003) and sellers need when creating a draft (AUC-001) — so guards are applied per endpoint instead of on the whole controller

```
apps/api/src/
  categories/                     ADM-003   → Dev 2
    GET    /categories                        public
    GET    /categories/admin                  ADMIN (includes inactive)
    POST   /categories                        ADMIN
    PATCH  /categories/:categoryId            ADMIN
    PATCH  /categories/:categoryId/activate   ADMIN
    PATCH  /categories/:categoryId/deactivate ADMIN
  admin/
    admin.module.ts                         → Dev 5 (registers all the controllers)
    users.controller.ts           ADM-002   → Dev 5
    actions.controller.ts         ADM-004   → Dev 5
    auctions.controller.ts        ADM-001   → Dev 4
    products.controller.ts        ADM-005   → Dev 3
    orders.controller.ts          ADM-006   → Dev 3
```

Every controller under `admin/` has its guard at class level, because they are all admin-only

### Web

The Admin Dashboard is a single centralized page with one sidebar holding both the auction and e-commerce menus, as the Team Role Distribution states that Dev 5 is responsible for "a centralized Admin Dashboard that calls endpoints ... based on the modules of Dev 2/3/4"

```
apps/web/src/app/(marketplace)/admin/
  users/  categories/  auctions/  products/  orders/  actions/
apps/web/src/features/admin/
  users/  categories/  auctions/  products/  orders/  actions/
```

---

## Resulting rules (everyone must follow them)

1. **Every admin write must write `admin_actions` in the same transaction** — not separately afterwards, so ADM-004 is guaranteed at the database level: an admin action without an audit log is impossible

   ```ts
   return this.prisma.$transaction(async (transaction) => {
     const category = await transaction.category.update({ ... });
     await transaction.adminAction.create({
       adminUserId: input.adminUserId,
       categoryId: category.id,
       actionType: AdminActionType.DEACTIVATE_CATEGORY,
       note: `Deactivated category "${category.name}"`,
     });
     return category;
   });
   ```

2. **Categories are deactivated, not deleted** — ADM-003 says "a category already in use is deactivated, not permanently deleted", so there is no `DELETE /categories/:id`

3. **Enforce a maximum depth of 2 levels in the service layer** — `model Category` is a self-relation whose depth the schema can't limit, so the service must check that the given parent has `parentId === null` and `isActive === true`

4. **Only active categories may be referenced** — both `AUC-001` and `PROD-001` must check that the incoming `categoryId` is a category with `isActive = true`, per SRS §5.1

---

## Consequences

**Pros**

- No schema change and no extra migration
- The audit trail is a single source, easy to query, matching ADM-004
- The Admin manages one category set; the data doesn't split into two sets that drift apart
- The team can still work in parallel without colliding, because the split is by file rather than by role

**Accepted cons**

- Categories that suit only one module also show up in the other module's dropdown — accepted in V1; if needed, fix it at the query level (e.g. hide categories with no active listings at all), not by adding a field to the schema
- Splitting admin duties by responsibility (least privilege) isn't supported yet — if it's needed in the future, it should be permission-based, not a role per module

---

## Alternatives considered and rejected

| Alternative | Why it was rejected |
| --- | --- |
| Separate `AUCTION_ADMIN` / `ECOMMERCE_ADMIN` | Contradicts SRS §2 and §5.1, requires a schema change, breaks ADM-004's single audit trail |
| `Category.scope` (`AUCTION` / `ECOMMERCE` / `BOTH`) | Directly contradicts SRS §5.1, which says "not scoped per module" — an example of it was left in `docs/KICKOFF_GUIDE.md`, a draft from before SRS v4, and was removed together with this ADR |
| Separate `auction_categories` / `product_categories` tables | The same problem as `scope` but worse, because the Admin really would maintain 2 sets — exactly what §4.4 chose to avoid |
| Move `categories` under `admin/` | `GET /categories` is a public endpoint (PROD-003, AUC-001); under `admin/` it would convey the wrong meaning, and the whole controller couldn't be guarded |

---

## Issues split off

**ADM-005 overlaps with PROD-002** — ADM-005 lets an admin suspend an inappropriate product listing, but PROD-002 also lets sellers switch their own products between `ACTIVE`/`INACTIVE`, so a seller could set it back to `ACTIVE` immediately after an admin suspends it

✅ **Decided** — the team concluded that if an admin suspends a listing, the seller must not be able to reopen it themselves. The details and the rules to implement are in [ADR-0002](0002-admin-suspended-product-status.md)

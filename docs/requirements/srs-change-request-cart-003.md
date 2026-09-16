# SRS Change Request — CART-003 and choosing which items to pay for

- **Status:** ✅ **Closed** — the code is in `dev`, and all 3 SRS changes are done in `BidNest-Auction and Marketplace-v6.pdf`
- **Created:** 2026-08-25 · **Closed:** 2026-08-25
- **Team approval:** 2026-08-25 — by reviewing and merging PR #100, which stated under *"CART-003 contradicts SRS v5 — please decide before merging"* that commit `88febcb` should be reverted if rejected; the team chose to merge
- **Proposed by:** Dev 3 (E-Commerce)
- **Current SRS:** `BidNest-Auction and Marketplace-v6.pdf` (the previous v5 has been removed)
- **Affected requirements:** CART-002, CART-003, CART-004

> This document is kept as a record of what was changed and why; nothing further needs doing. Same format as [srs-change-request-adm-005.md](./srs-change-request-adm-005.md)
> The text in the code blocks is what actually went into SRS v6 (the SRS is written in Thai; the blocks here are English translations)
>
> ✅ **The code and the SRS now match** — v6 says *"a single payment covering everything selected"*
> While v5 was still in place (Aug 25, between merging PR #100 and exporting v6), the document and the code were temporarily out of sync

---

# Part 1 — Background

Real users asked to **tick which cart items to pay for**. As it stood, a cart with items from 3 shops had to be paid for all at once; to pay for just one item you had to delete the other 2 first and add them back later, losing your selection and wasting time

But **SRS v5 (the previous edition) said clearly that the whole cart is paid** — the CART-003 sentence at the time was

> *"…you get 3 orders that can be tracked separately, while still paying once **for the whole cart** (see CART-004)"*

Building this feature without changing the SRS would immediately put the code and the document in conflict — the same problem the team had just fixed in the ADM-005 round — so it was proposed as a change request instead of changed quietly

---

# Part 2 — Ready-to-paste text

## Change 1 — CART-003 (required)

**Location:** page 7 · section `4.5 Cart and payment (simulated)` · table row **CART-003 Split orders across multiple sellers** · **Acceptance criteria** cell

**How:** delete all the text in that cell and paste this instead

```
The buyer can choose which items in the cart to pay for; by default every item is selected. At checkout the system groups only the selected items by seller and creates a separate Order for each seller (with its own order number, subtotal and status) under the same checkout_session_id, so a single checkout containing products from 3 sellers produces 3 orders that can be tracked separately, while still paying once for everything selected (see CART-004). Unselected items remain in the cart and their stock is not deducted. The totals and shop count shown on the cart and checkout pages must be calculated from the selected items only. Checkout cannot be pressed if nothing is selected, and if a selected item has already been removed from the cart (e.g. from another tab), the system must reject the whole payment rather than paying for only the remaining part
```

## Change 2 — CART-002 (required)

**Location:** page 6 · table row **CART-002 Manage cart** · **Acceptance criteria** cell

**How:** append this sentence to the end of the existing text (don't delete the existing text)

```
Besides changing quantities and removing items, the user can also tick or untick items to decide which ones to pay for (see CART-003). Unselecting is not removing; the item stays in the cart as before
```

## Change 3 — CART-004 (required)

**Location:** page 7 · table row **CART-004 Simulated payment** · **Acceptance criteria** cell

**How:** use Ctrl+H to replace the text

**Find**

```
If FAILED, no orders are created and the cart remains unchanged
```

**Replace with**

```
If FAILED, no orders are created and the cart remains unchanged, both the selected and the unselected items
```

---

# Part 3 — What has been implemented

**Schema untouched**, no new migration — uses the existing `cart_items.id`

| Where | What was done |
| --- | --- |
| `apps/api/src/order/dtos/checkout.dto.ts` | Added the field `cartItemIds?: string[]` as **optional** |
| `apps/api/src/order/checkout.service.ts` | `priceCart(buyerId, cartItemIds?)` filters with `id: { in: … }` |
| `apps/web/src/lib/cart-selection.ts` | Helpers to total the selected items and turn the selection into a query string |
| `apps/web/src/components/cart/cart-view.tsx` | A checkbox per row + "Select all" + a summary computed from the selection |
| `apps/web/src/components/checkout/checkout-view.tsx` | Reads the selection from the URL and sends `cartItemIds` with checkout |

## Backward compatibility

`cartItemIds` is optional — **if it isn't sent, the whole cart is paid exactly as before**. Existing code or tests that call `POST /orders/checkout` without knowing this field work no differently, and the web app only sends the field when the user hasn't selected everything

## Why the selection lives in the URL, not in state

`/checkout` is a different route from `/cart`. Kept in plain state, the selection would be lost when the user refreshes or opens a new tab and would silently become "the whole cart" — the kind of wrong answer nobody notices until they see the receipt — so it is put in `?items=<id>,<id>`

## Why the whole payment is rejected when a selected id is gone

Paying for only the remaining part would charge an amount the buyer never confirmed (they saw one total when they clicked, but were charged another), so it answers 400 and has the screen re-read the cart instead

## Tests added

`apps/api/test/ecommerce.e2e-spec.ts` — `describe('CART-003 — paying for part of the cart')`, 5 cases

- charges only the selected items (2 × 700 = 1,400, excluding the other 900 item)
- unselected items stay in the cart
- sending an id that was already paid for → 400 and the cart isn't touched
- sending an id from someone else's cart → 400 and that person's cart isn't touched
- not sending `cartItemIds` → the whole cart is paid as before

The whole file passes, 65/65

---

# Checklist

- [x] The team approved changing this behavior — merged PR #100 on Aug 25, 2026
- [x] The code is in `dev` (commit `88febcb`) with 5 e2e cases in `ecommerce.e2e-spec.ts`
- [x] Made the 3 changes from Part 2 in the original `.docx` file
- [x] Exported the PDF with `Save As → PDF`, **not** `Print to PDF` (see the reason in the ADM-005 change request)
- [x] Put the new PDF in place of `BidNest-Auction and Marketplace-v5.pdf` as v6 and updated the SRS path in `CLAUDE.md` to point at the new file
- [ ] Update the CART-002/003/004 stories in Jira

Only Jira is left, which lives outside the repo — the documentation work on the repo side is fully closed

---

# Checking v6 against v5

The text was extracted from both PDFs and diffed before the file went into the repo — **v6 is v5 plus the 3 changes in Part 2 only**. The number of requirement IDs is still 58; none were added or removed. The remaining differences in the file are just line re-wrapping from the export

The part that needed special checking is **§7.2**, because `apps/api/test/http/06-admin.http` cites an item number in it — confirmed to be the same text character for character, with the item order unchanged

## Files whose path/version references were updated too

| File | Before |
| --- | --- |
| `CLAUDE.md` | pointed at `-v5.pdf` |
| `docs/team-role/dev4-auction-workflow.md` | "SRS v5" + path `-v5.pdf` |
| `docs/team-role/dev3-ecommerce-workflow.md` | "SRS v5" + path `-v5.pdf` |
| `docs/team-role/dev2-backend-security-workflow.md` | "SRS v5" + path `-v5.pdf` |
| `docs/team-role/dev2-checklist.md` | pointed at `-v4.pdf`, which had been removed back in the ADM-005 round |
| `docs/KICKOFF_GUIDE.md` | said "SRS v1.0" |
| `apps/api/test/http/06-admin.http` | a comment cited "SRS v5 §7.2" |
| `docs/requirements/srs-change-request-adm-005.md` | the line saying which SRS edition is currently in the repo |

ADR-0001 and ADR-0002 are **not changed**, because their "References: SRS v4" line records which edition the decision was based on at the time — historical information that must be kept, per ADR convention — just like the history lines in `srs-change-request-adm-005.md` that still cite v5

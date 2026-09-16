# SRS Change Request — ADM-005 and product status

- **Status:** ✅ **Closed** — every change is made and exported as `BidNest-Auction and Marketplace-v5.pdf`
- **Last updated:** 2026-08-19
- **Source file:** `Auction_Ecommerce_SRS_v1_TH-แก้ไข-5.docx`
- **SRS in the repo:** `BidNest-Auction and Marketplace-v6.pdf` (the ADM-005 text changed in this round carries over unchanged — v6 only changes CART-002/003/004, see [srs-change-request-cart-003.md](./srs-change-request-cart-003.md))
- **Decision reference:** [ADR-0002](../architecture/adr/0002-admin-suspended-product-status.md)

> This document is kept as a record of what was changed and why; nothing further needs doing
> The text in the code blocks is what actually went into SRS v5 (the SRS is written in Thai; the blocks here are English translations)
> The reasoning for each change is in the "Supporting rationale" part at the end of the document

---

# Part 1 — Ready-to-paste text

## Change 1 — ADM-005

**Location:** page 9 · section `4.8 System administration (Admin)` · table row **ADM-005 Product listing oversight** · **Acceptance criteria** cell

**How:** delete all the text in that cell and paste this instead

```
The Admin can suspend inappropriate product listings by changing the product status to SUSPENDED, a status reserved for the Admin only; the seller cannot move out of this status themselves (see PROD-002). Only the Admin can reactivate the listing, and the system restores the status to ACTIVE or OUT_OF_STOCK based on the stock remaining at that moment. While the product is SUSPENDED, the seller restocking it does not automatically change the status to ACTIVE (see PROD-005). Every suspension or reactivation must record a reason, the same as ADM-001. Suspension blocks new orders (not found on public pages, cannot be added to the cart or checked out) but does not cancel orders that are already paid (PAID)
```

*This text fixes both SUSPEND being described like a separate flag and reactivation needing to restore ACTIVE or OUT_OF_STOCK in one step*

---

## Change 2 — PROD-002

**Location:** page 5 · section `4.4 Product catalog and product management (E-commerce)` · table row **PROD-002 Edit/delete own products** · **Acceptance criteria** cell

**How:** delete all the text in that cell and paste this instead

```
The seller can edit the price, details, images, category and stock while the product is ACTIVE or INACTIVE, and can switch the status between ACTIVE and INACTIVE themselves. Deletion is a soft-delete to the REMOVED status, which hides the product from public search. A product referenced by at least 1 order that has not been cancelled cannot be permanently deleted, only taken off sale, to preserve the integrity of order history. REMOVED is a terminal status with no restore in V1; a seller who only wants to stop selling temporarily should use INACTIVE instead, which they can reopen any time. For a product in SUSPENDED status (ADM-005), the seller cannot edit details, change the status or soft-delete; every request is rejected until the Admin reactivates the listing. Soft-delete must be blocked too, because moving to REMOVED would erase the trace that the product was ever suspended, so later checks would not find it
```

---

## Change 3 — §5.1 E-commerce row (2 changes in the same cell)

**Location:** page 9 · section `5.1 Core data structure` · table row **E-commerce** · **Current V1 entities / key fields** cell

This cell is very long; don't delete the whole cell — use Ctrl+H twice instead

**3.1 — Find this text**

```
product status ACTIVE/INACTIVE/OUT_OF_STOCK/REMOVED;
```

**Replace with**

```
product status ACTIVE/INACTIVE/OUT_OF_STOCK/REMOVED/SUSPENDED (SUSPENDED is reserved for ADM-005 only; the seller cannot move out of it);
```

**3.2 — Find this text and delete it (replace with nothing)**

```
; add SUSPENDED to the product status list
```

This text sits at the end of the cell, after `PROCESSING/SHIPPED/IN_TRANSIT/DELIVERED/CANCELLED` — an instruction from the previous change request that was copied in verbatim, not SRS content

---

## Change 4 (optional but recommended) — §7.2 item 8

**Location:** page 11 · section `7.2 E-commerce side` · item **8**

**How:** replace item 8 entirely

```
The Admin suspends an inappropriate product listing with a reason, and the action is recorded. The seller then tries to reopen the listing themselves, edit the product details and delete the product; all three must be rejected, and restocking must not put the product back on sale by itself
```

Why it should be added: the original item 8 only tested that the Admin can suspend, which already passed before the SRS change — the heart of ADM-005, "the seller cannot lift it themselves", was not tested by anyone

---

# Part 2 — Supporting rationale

## Background

SRS v4 had 2 requirements that contradicted each other — ADM-005 lets the Admin suspend inappropriate product listings, but PROD-002 also lets the seller switch `ACTIVE`/`INACTIVE` themselves. As a result, the seller could set it back to `ACTIVE` immediately after the Admin suspended it, **leaving ADM-005 with no real force**

The team made 2 decisions:

1. If the Admin suspends a listing, the seller must not be able to reopen it themselves → add a `SUSPENDED` status (migration `20260819031110_add_suspended_product_status`)
2. **No restore feature for deleted products in V1** → `REMOVED` is a terminal status; use `INACTIVE` for pausing sales temporarily instead

## ✅ Already fixed in revision 5

| Requirement | Text added |
| --- | --- |
| **PROD-005** | "…but cannot change the status of a product that has been SUSPENDed (ADM-005)" — the most critical point, now covered |
| **CART-001** | "…only ACTIVE items can be added to the cart; if an item in the cart changes status later, checkout is not possible" |
| **PROD-002** | "…for a SUSPENDED product, the seller cannot edit/change status/soft-delete" (still needed polishing per Change 2) |

## Rationale for Change 1 — ADM-005

The existing text said *"the status will not change from OUT_OF_STOCK to ACTIVE if the product is suspended (SUSPEND)"*, which implies the product is in `OUT_OF_STOCK` status **and** SUSPENDed at the same time

But `products.status` is a single field that holds a single value; when the Admin suspends it, the value becomes `SUSPENDED`, overwriting `OUT_OF_STOCK`. Left as it was, Dev 3 might implement it as a separate boolean (`isSuspended`), an option ADR-0002 has already rejected, **making the schema disagree with the SRS**

The other point is *"reactivate (ACTIVE)"* — ADR-0002 specifies that reactivation must restore `ACTIVE` **or** `OUT_OF_STOCK` based on the stock at that moment. If it only said `ACTIVE` and the Admin lifted the suspension with 0 stock left, you would get an `ACTIVE` product with nothing to sell, contradicting PROD-005

## Rationale for Change 2 — PROD-002

The parenthetical *"(to prevent getting around it by deleting and restoring)"* refers to a restore feature V1 does not have

The real reason soft-delete has to be blocked is that **`SUSPENDED` is stored in the same field the seller can write**, so moving to `REMOVED` would erase the trace that the product was ever suspended. If the guard checks the target status, the seller can detour `SUSPENDED → REMOVED → ACTIVE` in two steps, because the guard no longer fires on the second step

It was also missing the statement that `REMOVED` cannot be restored, which the team had just decided

## Checked and **no change needed**

| Requirement | Reason |
| --- | --- |
| PROD-003 Search and browse | Already says "can search public products with ACTIVE status" → `SUSPENDED` is filtered out automatically |
| PROD-004 Product detail | Already a public page for ACTIVE products |
| PROD-005 Stock management | Fixed in revision 5; the text is correct |
| CART-001 Add to cart | Fixed in revision 5; the text is correct |
| ADM-004 Audit log | Uses the existing `DEACTIVATE_PRODUCT` / `REACTIVATE_PRODUCT`; no new action type needed |
| §2 Administrator permissions table | "Suspend/reactivate inappropriate product listings" is still correct; adding "(SUSPENDED status)" for clarity is optional |
| §6 Security and quality | The rule "enforce permission checks on the server, not just in the UI" already covers it |

---

# Part 3 — The PDF export problem ✅ fixed

> **Summary:** v5 was exported with `Save As → PDF` from Word 365; the digits are no longer garbled, and the file shrank from 820 KB to 291 KB
> This section is kept as a record, to avoid repeating the mistake on the next export

The v4 edition (exported with `Microsoft: Print To PDF`) had a problem: **every digit in the document turned into Latin letters when copied or searched**, even though it looked correct on screen

| What the document should say | What copying produced |
| --- | --- |
| `2 trading modes` | `Ś trading modes` |
| `1 account` | `ř account` |
| `6-digit code` | `Ş-digit code` |
| `1 time per 60 seconds` | `ř time per ŞŘ seconds` |
| `extended at most 5 times` | `extended at most ŝ times` |

Digits 0–9 were mapped to `Ř ř Ś ś Ŝ ŝ Ş ...` in order, caused by a wrong ToUnicode map in the font embedded in the PDF

**Impact:** Ctrl+F for "2 minutes" found nothing, and requirement text copied out had garbled numbers — and those numbers are real requirements (2-minute anti-sniping, at most 5 extensions, offers expiring after 15 minutes)

**Fix:** when exporting from Word, use `File → Save As → PDF` or `File → Export → Create PDF/XPS` instead of `Print → Microsoft Print to PDF` (v4 used print-to-PDF, which often embeds fonts without a correct ToUnicode map)

---

# Checklist

- [x] Made the 4 changes from Part 1 in `Auction_Ecommerce_SRS_v1_TH-แก้ไข-5.docx`
- [x] Exported the PDF with Save As, not Print to PDF — digits are no longer garbled, and the file shrank from 820 KB to 291 KB
- [x] Put the new PDF at `docs/requirements/BidNest-Auction and Marketplace-v5.pdf`
- [x] Removed `BidNest-Auction and Marketplace-v4.pdf`
- [x] Updated the SRS path in `CLAUDE.md` to point at the new file
- [x] Updated dbdiagram.io to match `docs/architecture/erd/bidnest-erd-v1.dbml` (added `SUSPENDED` to `product_status`)
- [ ] Tell Dev 3 that the ADM-005, PROD-002, PROD-005 and CART-001 stories in Jira have extra conditions
- [ ] Tell Dev 1 / Dev 3 about the confirm dialog when deleting a product (must say it cannot be restored + offer INACTIVE)

SRS v6, `schema.prisma`, the ERD and the scaffold in `apps/api/src/admin/` all match now. For the decision details see [ADR-0001](../architecture/adr/0001-single-admin-role-and-shared-category-set.md) and [ADR-0002](../architecture/adr/0002-admin-suspended-product-status.md)

## Left for the team to do

The 2 unticked items at the end are coordination work, not code work — they have to be raised in Jira by hand

**Dev 3** — stories with conditions added:

| Story | What was added |
| --- | --- |
| ADM-005 | Suspend → `SUSPENDED`, reactivate → `ACTIVE`/`OUT_OF_STOCK` based on stock, write `admin_actions` in the same transaction |
| PROD-002 | A `SUSPENDED` product can't be edited/have its status changed/be soft-deleted — the guard checks the current status, not the target status |
| PROD-005 | auto-flip must skip `SUSPENDED` ⚠️ the easiest to get wrong; forgetting it breaks the system silently |
| CART-001 | Only `ACTIVE` items can be added to the cart |

**Dev 1 / Dev 3** — the confirm dialog when deleting a product must say "Deleted listings cannot be restored" and offer `INACTIVE` as the alternative; the "Pause listing" button should be more prominent than "Delete"

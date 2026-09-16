# SRS Change Request — catching the SRS up with the code (v6 → v7)

- **Status:** ✅ **Closed** — the code is in `dev`, and all 8 SRS changes are done in `BidNest-Auction and Marketplace-v7.pdf`
- **Created:** 2026-08-29 · **Closed:** 2026-08-29
- **Team approval:** 2026-08-29 — accepted all 8 changes as proposed and settled all three open questions; see the "Agreed decisions" section at the end of the document
- **Proposed by:** Dev 4 (Auction & Real-time) — compiled on behalf of the whole team, since the backlog came from several modules
- **Current SRS:** `BidNest-Auction and Marketplace-v7.pdf` (the previous v6 has been removed)
- **Affected requirements:** CHAT-004 (new), AUTH-007, WAT-001/002, CART-004, CART-005, AI-001, §5.1, §5.2

> This document is kept as a record of what was changed and why; nothing further needs doing. Same format as [srs-change-request-adm-005.md](./srs-change-request-adm-005.md) and [srs-change-request-cart-003.md](./srs-change-request-cart-003.md)
> The difference is that the two earlier ones were named after a single requirement, while this one is a **catch-all round** for everything that happened after v6, so it is named after the version instead
> The text in the code blocks is what actually went into SRS v7 (the SRS is written in Thai; the blocks here are English translations). **The reasoning for each change is in the "Supporting rationale" section at the end of the document**

---

# Part 1 — Background

v6 was exported on Aug 25. After that the team kept coding for another 4 days, adding **5 new migrations** the document did not know about

| migration | From which work |
| --- | --- |
| `20260824061652_add_product_watchlists` | Watching shop products (extending WAT-001/002) |
| `20260824132605_add_trusted_devices` | Remembering browsers that have verified the code (AUTH-007) |
| `20260825130238_add_auction_chat_and_seller_auto_reply` | Auction-side chat + seller auto-reply (CHAT-004) |
| `20260826091306_add_support_escalation` | Handing AI conversations over to an Admin (AI-001) |
| `20260827093921_order_item_for_auction` | Auction winners paying (CART-004/005) |

The biggest gap was that **CHAT-004 didn't exist in the SRS at all** — §4.4b only had CHAT-001/002/003 and NOT-008, yet the code had the endpoint, the tables, the screens and 4 commits citing this ID. That meant a fully implemented requirement with no acceptance criteria written down for anyone to check against

So this round did everything in one go, instead of fixing items one at a time and exporting a new PDF five times

---

# Part 2 — Ready-to-paste text

There are 8 changes, in SRS page order. **Change 3 adds a new requirement; the rest append to existing text. None of them delete existing text**

## Change 1 — AUTH-007 (required)

**Location:** page 3 · section `4.1 Authentication` · table row **AUTH-007** · **Acceptance criteria** cell

**How:** append this text to the end of the existing text (don't delete the existing text)

```
In addition, the system can remember a browser that has already answered the code correctly. If the user chooses "Remember this device" when entering the code, later logins to the same account from the same browser succeed without asking for the code again until the configured lifetime runs out (30 days by default, set with TRUSTED_DEVICE_TTL_DAYS). The code is still always required for the first login from a new browser. The system stores only the hash of the device token, never the token itself, and a token belonging to another account must not open this account. All remembered devices must be revoked when the user resets their password (AUTH-005). Remembering a device replaces only the second factor, never the password; every login still checks the password first as usual. Separately, a user with the ADMIN role can log in with the password alone, without the emailed code, when that environment has the ADMIN_SKIP_2FA switch turned on. The switch is off by default and exists mainly for the convenience of developer machines; regular users never get this exemption under any circumstances, and every admin login that skips the code must be logged
```

## Change 2 — WAT-001/002 (required)

**Location:** page 5 · section `4.3 Auctions, Watchlist, Notifications and Live Arena` · table row **WAT-001/002 Watchlist** · **Acceptance criteria** cell

**How:** append this text to the end of the existing text

```
Besides auctions, users can also watch shop products using the same mechanism, stored in a separate table of its own and likewise using the composite key user_id + product_id. Watching again must not create a duplicate and is not an error, keeping the original watch date so the order of the list does not shuffle; unwatching something that is not being watched is not an error either. Only published products can be watched, i.e. the same set of statuses regular buyers can see on the search page, and the watched list shows both auctions and products, paginated the same way as the search page
```

## Change 3 — CHAT-004 (required · a new requirement)

**Location:** page 6 · section `4.4b Buyer-Seller Chat` · **add a new row after the CHAT-003 row, which is the last row of this table**

**How:** add 1 row, filling in both cells as follows

**ID / requirement name cell**

```
CHAT-004 Auction-side chat and seller auto-reply messages
```

**Acceptance criteria cell**

```
A buyer can press the ask-the-seller button on an auction detail page to open a conversation with that listing's seller, just as CHAT-001 allows for shop products. A conversation is always tied to either a product or an auction, never both at once, and reopening with the same participants for the same auction must always return to the same conversation, enforced by unique auction_id + buyer_id + seller_id. A conversation can only be opened for published auctions in statuses regular buyers can see, and a seller cannot open a conversation about their own listing. Sending messages, the New Message notification (NOT-008) and restricting visibility to the two participants follow exactly the same rules as CHAT-002. In addition, a seller can set 1 shop auto-reply message in advance, at most 500 characters. When a buyer's order is paid successfully and becomes PAID, the system automatically sends that message into the conversation for the product in that order on the seller's behalf, once per order, since each order already belongs to a single seller per CART-003. If the seller has not set a message, or deleted it by saving an empty value, nothing is sent and it is not an error. A failed auto-reply must not cause an already successful payment to fail, and must not show any error to the buyer. Orders that come from winning an auction under CART-004 do not send the auto-reply, because the message is tied to the product's conversation, and the auction winner already has a conversation with the seller from the auction
```

## Change 4 — CART-004 (required)

**Location:** page 7 · section `4.5 Cart and payment (simulated)` · table row **CART-004 Simulated payment** · **Acceptance criteria** cell

**How:** append this text to the end of the existing text

```
Besides paying from the cart, an auction winner can pay for the item they won through the same checkout page, by sending auction_id instead of cart_item_ids; both cannot be sent together, because they specify two different things being bought. The amount charged comes only from that auction's sold_price, never a price number from the client, just as cart prices are never taken from the client, and only that auction's winner_user_id may pay. An auction that has not ended, or ended without selling (status is not SOLD), cannot be paid for. The system must return the same rejection message both when the auction does not exist and when the auction does not belong to the requester, so someone holding an id cannot guess whether the listing exists or has sold. An auction can only ever be paid for once, enforced by a unique index on order_items.auction_id, to prevent double payment from reopening the payment link or clicking twice at the same time. When the system detects it has already been paid, it must reject before charging; and if two requests collide exactly and slip through to the database layer, it must respond with a conflict that includes the checkout_session_id for later investigation, not a generic error. Every remaining step after that — calling MockPaymentProvider, recording payment_transactions, creating the PAID Order, snapshotting the address into order_addresses, creating the Shipment and sending notifications — follows exactly the same path as paying from the cart, under the same checkout_session_id
```

## Change 5 — CART-005 (required)

**Location:** page 7 · table row **CART-005** · **Acceptance criteria** cell

**How:** append this text to the end of the existing text

```
Orders that come from winning an auction under CART-004 must show the name of the won auction and the closing price to be paid, both on the summary page before paying and on the receipt afterwards, so the buyer clearly sees what they are paying for, rather than an empty product line because that line has no product_id
```

## Change 6 — AI-001 (required)

**Location:** page 8 · section `4.7 AI Features: Customer Service Chatbot, Price Estimator and Negotiator` · table row **AI-001** · **Acceptance criteria** cell

**How:** append this text to the end of the existing text

```
When the AI fails to answer 3 times in a row, or the user types a direct request to talk to staff such as "talk to admin" or "contact staff", the system offers a button to hand over to an Admin, without waiting for the AI to miss three times first. Pressing it changes the conversation status to ESCALATED and queues it for an Admin. A conversation has 3 statuses: AI_ONLY (the default), ESCALATED and RESOLVED. The system must re-check the handover conditions on the server rather than trusting values sent by the client, and pressing again, or pressing after it has already been handed over, must not create a duplicate queue entry. While a conversation is ESCALATED, the system no longer calls the AI; the user's messages go straight to the Admin. On the Admin side, admins see the queue of waiting conversations, take ownership of a conversation (recorded in assigned_admin_id), reply, and close it as RESOLVED. If the user writes again after it was closed, the conversation must automatically go back to ESCALATED. Both sides see new messages in real time, and conversations are saved to the database, so users can come back and read them even after closing the window
```

## Change 7 — §5.1 Entity summary table (required)

**Location:** pages 9-10 · section `5.1 Data model` · the V1 core entity table

**How:** there are 5 sub-changes, all of them **appending to the end of the existing list in that cell** — don't delete the existing text

**7.1 Identity row** — append after the word `password_reset_tokens`

```
, trusted_devices (stores the hash of the per-browser token, expiry date, last-used time and revocation time — AUTH-007)
```

**7.2 E-commerce row** — append after the word `shipment_events`

```
; order_items has both product_id and auction_id as nullable, with each line always tied to exactly one of them, and a unique index on auction_id so an auction can only be paid for once (CART-004); conversations has both product_id and auction_id as nullable in the same pattern, with a second unique set, auction_id+buyer_id+seller_id (CHAT-004); users has an auto_reply_message column for the seller's auto-reply message (CHAT-004)
```

**7.3 Engagement row** — append after the word `watchlists`

```
, product_watchlists (composite key user_id+product_id, same as watchlists but in a separate table, because products and auctions live in separate tables)
```

**7.4 Engagement row, continued** — append at the end of the description of `support_chat_sessions/support_chat_messages`

```
where support_chat_sessions has a status of AI_ONLY/ESCALATED/RESOLVED and assigned_admin_id points to the ADMIN user responsible for that conversation, and message roles gain an ADMIN value besides USER/ASSISTANT (AI-001)
```

**7.5 Integrity requirements row** — append after the sentence about the uniqueness of conversations on `(product_id, buyer_id, seller_id)`

```
auction-side conversations use a separate second unique set, (auction_id, buyer_id, seller_id); auction winner payments prevent double payment with a unique index on order_items.auction_id, and since Postgres always treats NULL values as distinct, this constraint only applies to auction lines and does not affect regular product lines
```

## Change 8 — §5.2 REST and Events (required)

**Location:** page 10 · section `5.2 REST and WebSocket`

**How:** there are 2 sub-changes, both appended

**8.1 REST endpoint list** — append after `/admin`

```
, /auctions/:id/conversations (open an auction-side conversation — CHAT-004), /users/me/auto-reply (seller auto-reply message — CHAT-004), /products/:id/watchlist and /watchlist/products (watching shop products — WAT-001/002), /support/chat/:sessionId/escalate and /admin/support/sessions (handing conversations over to an Admin — AI-001)
```

**8.2 Event list** — append after `notification:created`

```
, support:message and support:inbox_updated (messages and the conversation queue on the Admin side — AI-001)
```

---

# Part 3 — What has been implemented

All of the code is already in `dev`; this document writes the criteria after the fact, it does not propose anything new

## CHAT-004

| Where | What was done |
| --- | --- |
| `apps/api/src/chat/chat.service.ts` | `openAuctionConversation`, `getAutoReplyMessage`, `setAutoReplyMessage`, `sendPurchaseAutoReply` |
| `apps/api/src/chat/auction-conversation.controller.ts` | `POST /auctions/:id/conversations` |
| `apps/api/src/chat/auto-reply.controller.ts` | `GET` and `PATCH /users/me/auto-reply` |
| `apps/api/src/order/checkout.service.ts` | Calls `sendPurchaseAutoReply` after commit, skipping lines that have no `productId` |
| `apps/web/src/components/auction/negotiate-button.tsx` | The auction-side ask-the-seller button |
| `apps/web/src/components/chat/auto-reply-settings.tsx` · `apps/web/src/app/sell/settings/page.tsx` | The auto-reply settings page |
| migration `20260825130238` | `conversations.auction_id`, `product_id` made nullable, `users.auto_reply_message` |

## AUTH-007

| Where | What was done |
| --- | --- |
| `apps/api/src/auth/trusted-device.service.ts` | `isTrusted` / `remember` / `revoke` / `revokeAll`, storing only the SHA-256 of the token |
| `apps/api/src/auth/auth.service.ts` | The branching in `login` (admin skip → trusted device → send OTP) and remembering the device in `verifyTwoFactor` after a correct code |
| `apps/api/src/config/env.validation.ts` | `ADMIN_SKIP_2FA`, default false, and `TRUSTED_DEVICE_TTL_DAYS` |
| `apps/web/src/lib/auth/device-cookie.ts` | Stores the token on the browser side |
| migration `20260824132605` | The `trusted_devices` table |

## WAT-001/002, product side

| Where | What was done |
| --- | --- |
| `apps/api/src/product-watchlist/` | A whole new module — `POST` / `DELETE /products/:productId/watchlist`, `GET /watchlist/products`, `GET /watchlist/products/count` |
| `apps/web/src/components/shop/product-watch-button.tsx` · `product-watchlist-view.tsx` | The watch button and the list page |
| migration `20260824061652` | The `product_watchlists` table |

## CART-004 / CART-005, auction winner side

| Where | What was done |
| --- | --- |
| `apps/api/src/order/dtos/checkout.dto.ts` | Added `auctionId?` as optional, stating it cannot be combined with `cartItemIds` |
| `apps/api/src/order/checkout.service.ts` | `priceAuction` checks owner/status/double payment, and `runOrderTransaction` turns P2002 into 409 |
| `apps/web/src/components/checkout/checkout-view.tsx` | `AuctionCheckout` mode, read from `?auction=<id>` |
| `apps/web/src/components/auction/auction-complete-screen.tsx` | A button taking the winner to `/checkout?auction=<id>` |
| migration `20260827093921` | `order_items.auction_id` with unique, and `product_id` made nullable |

## AI-001 handover to an Admin

| Where | What was done |
| --- | --- |
| `apps/api/src/support-chat/support-chat.service.ts` | `ESCALATION_THRESHOLD = 3`, the list of ask-for-a-human phrases, `escalate()` re-checking on the server |
| `apps/api/src/admin/support.service.ts` · `support.controller.ts` | The queue, `claim`, replies, `resolve` |
| `apps/web/src/components/admin/admin-support-thread.tsx` · `support-session-list.tsx` | The Admin-side screens |
| migration `20260826091306` | `support_chat_sessions.status` / `assigned_admin_id`, enum `SupportSessionStatus`, the `ADMIN` value in `ChatRole` |

---

# Part 4 — ERD changes to follow

**✅ All 6 items are synced** — when this was proposed, `docs/architecture/erd/bidnest-erd-v1.dbml` had last been synced at commit `fa0f3cb` (the 6-field shipping address) and was behind on the following

- missing the `product_watchlists` table
- missing the `trusted_devices` table
- `conversations` missing `auction_id`, and `product_id` needed to be nullable with a second unique set
- `users` missing `auto_reply_message`
- `order_items` missing `auction_id` with unique, and `product_id` needed to be nullable
- `support_chat_sessions` missing `status` / `assigned_admin_id`, missing enum `support_session_status` and the `ADMIN` value in enum `chat_role`

**`schema.prisma` untouched** — all of this is making the documentation match the schema that was already migrated, not changing the schema

---

# Checklist

- [x] The team approved the text of all 8 changes, in particular accepting **CHAT-004 as an official requirement** — agreed 2026-08-29
- [x] All of the code is in `dev`
- [x] Made the 8 changes from Part 2 in the original `.docx` file
- [x] Exported the PDF with `Save As → PDF`, **not** `Print to PDF` (the reason is in the ADM-005 change request)
- [x] Put the new PDF in place as `BidNest-Auction and Marketplace-v7.pdf` and removed v6
- [x] Checked v7 against v6 — the requirement count must be **59** (the original 58 + CHAT-004), and §7.2 must not change order, because `apps/api/test/http/06-admin.http` cites an item number in it
  - Checked 2026-08-29 · **exactly 59 rows** — counted as "table rows", not IDs, because 3 rows combine several IDs (`NOT-001..004`, `WAT-001/002`, `LIV-003/004/005`); counting every ID separately gives 65
  - `CHAT-004` is now in §4.4b · no `WAT-003` appeared · `ADMIN_SKIP_2FA` and `TRUSTED_DEVICE_TTL_DAYS` are in AUTH-007 as agreed
  - **§7.2 item 8 is still the same item** — "The Admin suspends a listing … the seller tries to reopen it, edit it and delete it; all three must be rejected", matching the comment at `06-admin.http:43`, order unchanged
- [x] Synced the ERD per Part 4
- [x] Updated the v6 → v7 paths and versions in `CLAUDE.md`, `docs/KICKOFF_GUIDE.md`, `docs/team-role/dev2-backend-security-workflow.md`, `dev2-checklist.md`, `dev3-ecommerce-workflow.md`, `dev4-auction-workflow.md`, `apps/api/test/http/06-admin.http`
- [ ] Add the CHAT-004 story and update AUTH-007 / WAT / CART-004 / CART-005 / AI-001 in Jira · *not done yet*

ADR-0001 and ADR-0002 **need no changes** — the "References: SRS v4" line records which edition the decision was based on at the time, historical information that must be kept per ADR convention, just like the history lines in the earlier change requests

---

# Agreed decisions

These three were open questions at proposal time; the team settled them all on **2026-08-29**, and v7 was exported according to the outcomes below

1. **CHAT-004 is an official new requirement** ✅ — not merged into CHAT-001, because that would make one very long item mixing two topics: auction-side chat and auto-reply messages. As a result, v7 has **59 requirements** in total
2. **ADMIN_SKIP_2FA is written into the SRS** ✅ — it is in AUTH-007's acceptance criteria per the text in Change 1. Even though it is an environment-level switch rather than a user-facing feature, it weakens the security of the most privileged accounts, so it has to be auditable from the documentation, not tribal knowledge from `.env.example`
3. **`product_watchlists` uses the existing WAT-001/002, no new ID** ✅ — written as text appended to the existing criteria per Change 2, because it is the same mechanism as watching auctions. No WAT-003 was added, so the only new requirement is CHAT-004

---

# Supporting rationale

## Why CHAT-004 shouldn't be left undocumented

Every dev's workflow says the same thing: **the SRS "Acceptance criteria" cell decides whether a requirement passes**. A feature that isn't in the document has no criteria to check against; whoever takes it over won't know what "correct" means, and at hand-in there's nothing to confirm it's complete

## Why the auto-reply is skipped for auction orders

An auto-reply needs a conversation to go into, and a conversation is tied to one product. An auction listing isn't a product, since it lives in a separate table; sending one would mean creating a shadow product, which would show up in search — more harm than good. And the auction winner already has a conversation with the seller from the auction, so nobody is left unable to reach the seller

## Why order_items uses two nullable FKs instead of a single polymorphic column

It is the same pattern `conversations` already uses for "either a product or an auction", so real foreign keys still exist in both directions and the database still enforces correctness — unlike a polymorphic column, which has to be checked by hand in code

## Why double payment has to be prevented with a unique index, not just a code check

A code check only stops the normal case of reopening the link. If two requests race each other exactly, both pass the check at the same time and charge twice for one listing; the unique index is the only thing that truly prevents this. The code check still has to exist, because it happens **before** charging, so it gives a readable answer instead of charging and then failing

## Why trusted devices store only a hash

Like refresh tokens — if the database leaks, whoever gets the table must not be able to use it. SHA-256 is used rather than bcrypt because the token is a random 256-bit value; there is no human-chosen password whose guessing needs slowing down

## Why the handover to an Admin has to be re-checked on the server

The previous response sends a status value back for the client to decide whether to show the button. If the server also trusted that value when the button is pressed, anyone could call the endpoint directly and get into the Admin queue without talking to the AI at all

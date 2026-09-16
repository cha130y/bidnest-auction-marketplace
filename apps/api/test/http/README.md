# How to test the API (e-commerce and auction modules)

AUTH-008 has landed — `MockAuthGuard` and the `x-mock-user-id` header have been removed.
Every request that is not `@Public()` now needs a **real bearer token**:

```
Authorization: Bearer {{buyerToken}}
```

`AccessTokenGuard` verifies the token and then **re-reads the account from the DB on every request**, so
an account that was just suspended cannot keep using its existing token (ADM-002)

## 1. Machine setup (one time)

```bash
# 1) Start Postgres (port 5433)
docker compose -f infra/docker/compose.dev.yml up -d

# 2) Set up env
cp apps/api/.env.example apps/api/.env

# 3) Create the tables
pnpm --dir apps/api exec prisma migrate dev

# 4) Load the starter data (users / categories / products)
pnpm --dir apps/api exec prisma db seed

# 5) Run the API
pnpm dev:api          # -> http://localhost:4000
```

> **The seed prints `@xToken = ...` lines at the very end — copy them into the top of the `.http` file**
> Tokens expire per `JWT_ACCESS_TTL` (15 minutes by default); once you start getting 401, seed again
> and paste over them. No need to log in for real, since login has to wait for an emailed OTP first (AUTH-007)


## 2. Starter users

| Variable | role | UUID | Used for |
|---|---|---|---|
| `{{adminToken}}` | ADMIN | `...0001` | View all orders, suspend/reactivate listings — **can't buy or sell** |
| `{{sellerAToken}}` | USER | `...0002` | Owns products `...0201` (keyboard) and `...0202` (USB hub) |
| `{{sellerBToken}}` | USER | `...0003` | Owns products `...0203` (jacket) and `...0204` (figurine) |
| `{{buyerToken}}` | USER | `...0004` | The main buyer used in most tests |

> For more data to build screens with (120 products, 47 orders, chats, notifications)
> also run `pnpm --dir apps/api seed:mock` — it prints tokens for the mock accounts the same way

Starter products:

| id | Name | Price | Stock | Seller | Notes |
|---|---|---|---|---|---|
| `...0201` | Mechanical Keyboard 65% | 2500.00 | 10 | A | 10% off for 3 or more (PROD-007) |
| `...0202` | USB-C Hub 8-in-1 | 1200.00 | 5 | A | |
| `...0203` | Vintage Denim Jacket | 1800.00 | 2 | B | |
| `...0204` | Limited Edition Figurine | 4500.00 | 1 | B | Only 1 in stock, for testing sold-out |

## 3. Sending requests with `.http` files

**VS Code** — install the `humao.rest-client` extension, open a file and click `Send Request` above
each block
**JetBrains (WebStorm / IntelliJ)** — open the file directly and pick the `local` environment
from `http-client.env.json`

Send them **top to bottom within the same file**, because each file passes ids along by itself
(`# @name xxx`, then reference `{{xxx.response.body.$.id}}`), so you don't have to copy ids by hand

| File | Contents |
|---|---|
| `_env.http` | Shared variables — other files copy this block to their top; always edit it here first |
| `00-health.http` | Checks the API is up |
| `01-product.http` | List / search / detail / edit / stock / delete |
| `02-cart.http` | Cart + quantity discount + multi-seller cart |
| `03-order.http` | checkout → orders split per seller → purchase/sales lists |
| `04-shipment.http` | Full 4-step shipment timeline + cancel-and-restock case |
| `05-chat.http` | Open a chat room / send messages / inbox |
| `06-admin.http` | View all orders / suspend-reactivate listings |
| `07-negative.http` | Cases that must fail — 401 / 403 / 404 / 400 (**no 500s allowed**) |
| `08-auction.http` | Auctions: create a private draft + pre-publish validation + preview/publish + public page + edit/cancel + auction end + Hot Auctions + auction-side failure cases (AUC-001..008) |
| `09-bid.http` | Auctions: place bids + safe retry + how to test realtime + anti-sniping + bid history + bidding failure cases (BID-001..005) |
| `10-notification.http` | Notification bell: list / unread count / mark one read / mark all read (NOT-005..008) |

## 4. Sending requests with Postman

`apps/api/test/postman/` has 2 files to import:

- `bidnest-ecommerce.postman_collection.json` — collection
- `bidnest-local.postman_environment.json` — the environment (select `BidNest local` before sending)

Click **Run collection** to run everything in one go; every request has a `pm.test` checking its status code
(the collection runs in the same order as the `.http` files and saves ids into variables automatically)

## 5. What to watch besides the response

Keep the terminal running `pnpm dev:api` open and watch for these logs:

- `[simulated] charge 3000.00 via CARD -> SUCCEEDED` — the simulated payment (no real money)
- `[stub] order:status_changed -> user:...` — the event that will become Dev 4's real WebSocket
- `[stub] notification:created -> user:...` — notifications NOT-005 / NOT-006 / NOT-007

## 6. Special cases the system provides for breaking things on purpose

| To test | How |
|---|---|
| Payment declined | Make the cart total **exactly 666.00** (`MockPaymentProvider.DECLINE_AMOUNT`) — a ready-made script is in `07-negative.http` |
| Sold out mid-purchase | Use figurine `...0204`, which has only one left |
| Hidden product | Have an admin `deactivate` it, then search — it must not be found, but the owner can still open it |
| Quantity discount | Put keyboard `...0201` in the cart, 3 or more |
| Cancel and restock | Move the status to `CANCELLED` while it is still `PROCESSING` |

## 7. Looking at the real data in the database

```bash
pnpm --dir apps/api exec prisma studio
```

## 8. Automated tests

```bash
pnpm --dir apps/api test        # unit (auth, auction)
pnpm --dir apps/api test:e2e    # e2e (auth, auction — needs the DB running)
```

e2e creates its own users/categories and deletes them when done, without relying on the seed, so it can be re-run any number of times

These `.http` files serve as a spec for now; anyone adding `*.e2e-spec.ts`
can convert straight from them (the expected status is already noted on every request)

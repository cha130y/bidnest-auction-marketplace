/**
 * Response shapes returned by apps/api. Kept in sync by hand with the mappers
 * listed against each block — every monetary field is a **string** because
 * Prisma Decimal is serialised with `.toFixed(2)` / `.toString()`.
 */

// prisma/schema.prisma
export type ProductStatus =
  | "ACTIVE"
  | "INACTIVE"
  | "OUT_OF_STOCK"
  | "REMOVED"
  | "SUSPENDED"

export type ProductCondition = "NEW" | "USED"

export type OrderStatus = "PENDING" | "PAID" | "CANCELLED"

export type ShipmentStatus =
  | "PROCESSING"
  | "SHIPPED"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "CANCELLED"

// src/payment/types/payment-provider.type.ts
export type PaymentMethod = "CARD" | "BANK_TRANSFER" | "E_WALLET"

// src/product/constants/product-sort.constant.ts
export type ProductSort = "price_asc" | "price_desc" | "newest"

export type Paginated<T> = {
  items: T[]
  meta: { page: number; limit: number; total: number; totalPages: number }
}

// ── src/product/product.mapper.ts → toPublicProduct ─────────────────────────
export type ProductImage = {
  // PROD-002 — what a seller's screen names when it asks for one to go.
  id: string
  url: string
  position: number
  isPrimary: boolean
}

/** What POST /uploads/images answers with, before any listing exists. */
export type StoredImage = {
  url: string
  storageKey: string
}

export type Product = {
  id: string
  title: string
  description: string
  price: string
  stockQty: number
  condition: ProductCondition
  status: ProductStatus
  /** PROD-007 — null when the seller set no quantity rule */
  quantityDiscount: { minQty: number; percent: string } | null
  category: { id: string; name: string; slug: string }
  seller: { id: string; displayName: string | null }
  images: ProductImage[]
  createdAt: string
  updatedAt: string
}

/**
 * PROD-006 / SRS §6 — `negotiationFloor` is added by `toOwnerProduct` only.
 * Never render it on a buyer-facing surface.
 */
export type OwnerProduct = Product & { negotiationFloor: string | null }

/**
 * PROD-002 — what `DELETE /products/:id` actually did.
 *
 * A delete is not always a delete: `ProductService.remove` counts the order
 * items still pointing at the listing and deactivates it instead when any
 * order that is not CANCELLED references it, so order history keeps
 * resolving. `status` is the only way to tell the seller which of the two
 * happened.
 */
export type ProductRemoval = {
  id: string
  status: "REMOVED" | "INACTIVE"
  message: string
}

// ── src/categories/categories.service.ts → categorySelect ───────────────────
export type Category = {
  id: string
  parentId: string | null
  name: string
  slug: string
  description: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type CategoryTree = Category & { children: Category[] }

// ── src/cart/cart.service.ts → buildCartView / buildLine ────────────────────
export type CartItemIssue = "PRODUCT_UNAVAILABLE" | "INSUFFICIENT_STOCK"

export type CartItem = {
  id: string
  quantity: number
  product: {
    id: string
    title: string
    status: ProductStatus
    stockQty: number
    imageUrl: string | null
  }
  seller: { id: string; displayName: string | null }
  unitPrice: string
  effectiveUnitPrice: string
  discountPercent: string | null
  discountAmount: string
  subtotal: string
  issue: CartItemIssue | null
}

export type Cart = {
  items: CartItem[]
  /** CART-003 — > 1 means checkout will split into one order per seller */
  sellerCount: number
  summary: { itemCount: number; discountTotal: string; total: string }
}

// ── src/order/order.service.ts → toOrderView ────────────────────────────────
export type ShippingAddress = {
  recipientName: string
  line1: string
  line2: string | null
  city: string
  postalCode: string
  phone: string
}

export type OrderItem = {
  id: string
  quantity: number
  unitPrice: string
  lineTotal: string
  product: { id: string; title: string; imageUrl: string | null }
}

export type Order = {
  id: string
  checkoutSessionId: string
  status: OrderStatus
  subtotal: string
  createdAt: string
  buyer: { id: string; displayName: string | null }
  seller: { id: string; displayName: string | null }
  shipment: {
    status: ShipmentStatus
    trackingNumber: string | null
    carrier: string | null
  } | null
  shippingAddress: ShippingAddress | null
  items: OrderItem[]
}

// ── src/order/checkout.service.ts → checkout ────────────────────────────────
export type CheckoutResult = {
  checkoutSessionId: string
  paymentStatus: "SUCCEEDED"
  paymentReference: string
  total: string
  /** CART-003 — one entry per seller that had lines in the cart */
  orders: { id: string; sellerId: string; subtotal: string }[]
}

// ── src/shipment/shipment.service.ts → getTimeline ──────────────────────────
export type ShipmentTimeline = {
  orderId: string
  status: ShipmentStatus
  trackingNumber: string | null
  carrier: string | null
  /** SRS §6 — keep a "simulated" badge on screen while this is true */
  isSimulated: boolean
  timeline: { status: ShipmentStatus; at: string }[]
  /** SHIP-001 — allowed next steps, so the UI never hardcodes the sequence */
  nextStatuses: ShipmentStatus[]
}

// ── src/auction/auction.mapper.ts → toPublicAuction ─────────────────────────
/**
 * AUC-005 — narrower than the database enum on purpose. Every buyer-facing
 * route filters through PUBLIC_AUCTION_STATUSES, so DRAFT and CANCELLED never
 * reach the browser — not even the seller's own view of their own auction.
 * See src/auction/constants/public-auction-status.constant.ts.
 */
export type AuctionStatus = "SCHEDULED" | "ACTIVE" | "SOLD" | "UNSOLD"

/** The four cards on the home page. Mirrors AUCTION_SECTIONS in the API. */
export type AuctionSection =
  | "hot"
  | "ending-soon"
  | "starting-soon"
  | "recently-ended"

export type AuctionImage = {
  /** Needed to remove one — see removeDraftImage. */
  id: string
  url: string
  position: number
  isPrimary: boolean
}

export type Auction = {
  id: string
  title: string
  description: string
  condition: ProductCondition
  status: AuctionStatus
  currency: string
  startingPrice: string
  minBidIncrement: string
  currentPrice: string
  /**
   * LIV-002 — the lowest amount this auction will accept right now, computed
   * by the same function BID-001 rejects bids with. Never work this out on the
   * client: the opening bid is measured against the starting price, not
   * against a `currentPrice` of 0, and deriving it gets the first bid of every
   * auction wrong.
   */
  minimumNextBid: string
  /** AUC-003 — the reserve never leaves the API. This is the whole answer. */
  reserveMet: boolean
  /**
   * AUC-005 — a SCHEDULED auction is public to look at but not to bid on.
   * Read this rather than comparing `status`, so the rule stays in one place.
   */
  biddingOpen: boolean
  bidCount: number
  scheduledStartAt: string | null
  originalEndAt: string | null
  /** BID-004 — moves when anti-sniping extends the auction. `originalEndAt` does not. */
  currentEndAt: string | null
  publishedAt: string | null
  startedAt: string | null
  /** AUC-007 — when settlement recorded the outcome, not when it was due to end. */
  endedAt: string | null
  extensionCount: number
  /**
   * LIV-004 — what somebody actually paid, and null unless they did. Null on
   * an UNSOLD auction because there was no sale, not to hold anything back:
   * `currentPrice` still shows where the bidding reached.
   */
  soldPrice: string | null
  category: { id: string; name: string; slug: string }
  seller: { id: string; displayName: string | null }
  images: AuctionImage[]
  createdAt: string
  updatedAt: string
}

/**
 * AUC-003 / SRS §6 — `reservePrice` is added by `toOwnerAuction` and comes back
 * only when the request carries the seller's own token. Never render it on a
 * buyer-facing surface.
 */
export type OwnerAuction = Auction & { reservePrice: string | null }

// ── src/bid/bid-history.mapper.ts → toPublicBid ─────────────────────────────
export type PublicBid = {
  id: string
  amount: string
  sequenceNo: number
  placedAt: string
  /**
   * BID-003 — masked by the API, the same way in the history, the arena and
   * the broadcast, so one person reads as one person across all three. Render
   * it as given; there is no unmasked name to fall back to.
   */
  bidder: string
  /** True only for the signed-in viewer's own bids. */
  isYours: boolean
}

// ── src/live/utils/calculate-countdown.util.ts ──────────────────────────────
/**
 * LIV-001 — both the absolute times and the milliseconds left, on purpose.
 *
 * Count down from `msUntilEnd`, not from `endsAt` minus the browser's clock: a
 * device whose clock is wrong would otherwise show a deadline that disagrees
 * with the server that enforces it. `serverTime` is what the other fields were
 * measured against.
 */
export type AuctionCountdown = {
  serverTime: string
  startsAt: string | null
  endsAt: string | null
  /** Clamped at 0 once it has started. */
  msUntilStart: number
  /** Clamped at 0 once it has ended. */
  msUntilEnd: number
}

// ── src/live/utils/describe-sudden-death.util.ts ────────────────────────────
export type AuctionExtension = {
  extensionNumber: number
  previousEndAt: string
  newEndAt: string
  /**
   * The bid that moved the deadline, so a panel can say "this amount pushed
   * it to that time" and be checkable. Read through the extension row rather
   * than from the auction: later bids move the current price, and it would
   * otherwise credit the extension to an amount placed after it.
   */
  triggeringBid: string
}

/**
 * LIV-003 / BID-004 — anti-sniping. `active` stays true when
 * `extensionsRemaining` reaches 0: the auction is still in its closing window,
 * it just cannot be pushed back any further.
 */
export type SuddenDeath = {
  active: boolean
  windowMs: number
  extensionMs: number
  extensionCount: number
  extensionsRemaining: number
  lastExtension: AuctionExtension | null
}

// ── src/live/utils/describe-auction-result.util.ts ──────────────────────────
export type AuctionOutcome = "SOLD" | "UNSOLD"

/**
 * LIV-004 — null while the auction is still running, which is what tells a
 * screen to keep showing the arena rather than a result.
 */
export type AuctionResult = {
  outcome: AuctionOutcome
  endedAt: string | null
  /** What somebody paid. Null on UNSOLD, because there was no sale. */
  soldPrice: string | null
  /**
   * The highest bid it reached, sold or not. Null when nobody bid at all — a
   * price of 0 there means "no price", not "it went for nothing".
   */
  finalPrice: string | null
  bidCount: number
  reserveMet: boolean
  /** Only a sale has a winner; the top bidder on an unsold auction did not win. */
  winner: PublicBid | null
}

// ── src/live/utils/describe-bidding-access.util.ts ──────────────────────────
/**
 * Why the bid control is unusable. The room's own state comes first, because
 * it is the same answer for everybody in it — a personal reason on top of
 * "this auction is not open" would only be noise.
 */
export type BidBlockedReason =
  | "AUCTION_NOT_OPEN"
  | "YOU_ARE_THE_SELLER"
  | "ADMINS_DO_NOT_BID"

// ── src/live/live.service.ts → getLobby ─────────────────────────────────────
/**
 * LIV-001 — the viewer's own participation. Null rather than a false-ish
 * object when nobody is signed in: that is a different thing from being signed
 * in and not having joined.
 */
export type AuctionParticipation = {
  joined: boolean
  /** Only while they are here, so no screen can say "joined 20 minutes ago" to somebody who left. */
  joinedAt: string | null
}

export type AuctionLobby = {
  auction: Auction
  participantCount: number
  countdown: AuctionCountdown
  you: AuctionParticipation | null
}

// ── src/live/live.service.ts → getArena ─────────────────────────────────────
export type ArenaParticipation = AuctionParticipation & {
  canBid: boolean
  blockedBy: BidBlockedReason | null
}

export type AuctionArena = Omit<AuctionLobby, "you"> & {
  /** The bid that would win right now, ordered the way settlement picks (AUC-007). */
  leader: PublicBid | null
  /** Newest first — an arena reads downwards from what just happened. */
  recentBids: PublicBid[]
  suddenDeath: SuddenDeath
  result: AuctionResult | null
  you: ArenaParticipation | null
}

// ── src/bid/bid.service.ts → placeBid ───────────────────────────────────────
/**
 * BID-001 — what comes back to the person who just bid.
 *
 * Deliberately not `PublicBid`: this is the bidder's own row, so it carries
 * `bidderId` and `clientRequestId` and does *not* carry the masked `bidder`
 * name or `isYours`. Read the arena or the history for the public view — those
 * are the shapes everyone else sees.
 *
 * BID-002 — posting the same `clientRequestId` twice answers with this same
 * bid rather than placing a second one.
 */
export type PlacedBid = {
  id: string
  auctionId: string
  bidderId: string
  amount: string
  sequenceNo: number
  clientRequestId: string
  placedAt: string
}

// ── src/watchlist/watchlist.service.ts ──────────────────────────────────────
/**
 * WAT-001 — the answer to watching or unwatching, from either direction.
 *
 * `watching` is the state afterwards, so a button can render straight from it
 * without inferring which call it just made. Watching twice is not an error:
 * the second call returns the first `watchedAt` unchanged.
 */
export type WatchToggle = {
  auctionId: string
  watching: boolean
  /** Present when watching; the moment it was first added, not re-stamped. */
  watchedAt?: string
  /** Present when unwatching; false if there was nothing to remove. */
  removed?: boolean
}

/**
 * WAT-002 — a row of the watchlist.
 *
 * Carries the countdown and the result alongside the auction so a list of
 * things somebody is following can show how long each has left, or how it
 * ended, without a request per row.
 */
export type WatchlistEntry = {
  watchedAt: string
  auction: Auction
  countdown: AuctionCountdown
  /** Null while it is still running (LIV-004). */
  result: AuctionResult | null
}

// ── src/product-watchlist/product-watchlist.service.ts ──────────────────────
/**
 * The same answer as `WatchToggle`, for a listing rather than an auction.
 *
 * Kept as its own type rather than widening that one: the two come from
 * separate tables and separate routes, and a shared type with an optional
 * `auctionId` and an optional `productId` would let a screen read the field it
 * is never going to get.
 */
export type ProductWatchToggle = {
  productId: string
  watching: boolean
  /** Present when following; the moment it was first added, not re-stamped. */
  watchedAt?: string
  /** Present when unfollowing; false if there was nothing to remove. */
  removed?: boolean
}

/**
 * A row of the followed-listings list.
 *
 * No countdown or result: a listing has neither. The product is the public
 * shape, so `negotiationFloor` is not on it even for the seller (PROD-006).
 */
export type ProductWatchlistEntry = {
  watchedAt: string
  product: Product
}

// ── prisma/schema.prisma → NotificationType ─────────────────────────────────
/**
 * All eight kinds share one table and one route, which is deliberate: the bell
 * shows a single count rather than one per module.
 *
 * The first four are the auction side (NOT-001..004). The rest belong to the
 * e-commerce and chat modules — a screen rendering this list will meet them,
 * so they are named here rather than left to widen the type by surprise.
 */
export type NotificationType =
  | "OUTBID"
  | "AUCTION_WON"
  | "AUCTION_ENDED"
  | "AUCTION_CANCELLED"
  | "ORDER_PLACED"
  | "SHIPMENT_UPDATE"
  | "DELIVERED"
  | "NEW_MESSAGE"

// ── src/notification/notification.service.ts ────────────────────────────────
/**
 * `title` and `message` are written by the API, already readable, so nothing
 * on screen composes copy from `type`. Only the four id fields are for the
 * client: they say what a row can link to, and exactly one of them is set.
 */
export type AppNotification = {
  id: string
  type: NotificationType
  title: string
  message: string
  /** Null until it has been read. */
  readAt: string | null
  createdAt: string
  orderId: string | null
  conversationId: string | null
  auctionId: string | null
  bidId: string | null
}

/**
 * The list, with the badge count alongside it.
 *
 * `unread` is the account's *total* unread, not the count of what came back:
 * asking for one `types=` slice still reports every unread notification,
 * because the badge is one number for the whole product. Verified against the
 * API — a filtered read returned 42 while showing a single type.
 */
export type NotificationPage = {
  items: AppNotification[]
  unread: number
  meta: { page: number; limit: number; total: number; totalPages: number }
}

// ── src/auction/utils/validate-draft-for-publish.util.ts ────────────────────
/**
 * AUC-002 — one thing standing between a draft and being published.
 *
 * `code` is the stable identifier and `message` is already readable, so a
 * screen shows the message and may key off the code; `field` is what to
 * highlight in the form.
 */
export type DraftIssue = {
  field: string
  code: string
  message: string
}

/** AUC-002 — `ready` is the whole answer; `issues` is why not. */
export type DraftValidation = {
  auctionId: string
  ready: boolean
  issues: DraftIssue[]
}

/**
 * AUC-001 — the seller's own drafts.
 *
 * Not `Paginated<T>`: this route answers with `items` and no `meta`, because a
 * seller's unpublished drafts are a short list rather than a catalogue.
 */
export type OwnedDraftList = {
  items: OwnerAuction[]
}

// ── src/auction/constants/auction-image.constant.ts ─────────────────────────
/**
 * The upload limits, mirrored so a form can enforce and explain them before a
 * file leaves the browser. The API checks all three again — these exist to
 * save a wasted upload, not to be the rule.
 */
export const MAX_AUCTION_IMAGES = 8
export const MAX_AUCTION_IMAGE_BYTES = 5 * 1024 * 1024
export const AUCTION_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const

/**
 * PROD-001/002 — the same figures for a listing. The API shares one ceiling
 * across both, so these are aliases rather than a second set to keep in step.
 */
export const MAX_PRODUCT_IMAGES = 8
export const MAX_PRODUCT_IMAGE_BYTES = MAX_AUCTION_IMAGE_BYTES
export const PRODUCT_IMAGE_MIME_TYPES = AUCTION_IMAGE_MIME_TYPES

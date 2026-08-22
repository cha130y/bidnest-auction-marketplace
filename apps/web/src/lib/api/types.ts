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
  url: string
  position: number
  isPrimary: boolean
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

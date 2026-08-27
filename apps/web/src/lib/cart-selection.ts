import type { Cart, CartItem } from "@/lib/api/types"

/**
 * CART-003 — which cart lines a checkout is for, carried between `/cart` and
 * `/checkout`.
 *
 * The URL rather than a store: `/checkout` is its own route, and a buyer who
 * reloads it, or opens it in a second tab, has to be paying for the same
 * things. State held in memory would quietly become "everything" on reload,
 * which is the one wrong answer nobody would notice until the receipt.
 *
 * An absent parameter means the whole cart, so every link that existed before
 * selection did still means what it always meant.
 */
export const SELECTION_PARAM = "items"

/**
 * The auction a winner is paying for, when `/checkout` is opened from a result
 * screen rather than from the cart.
 *
 * In the URL for the same reason `items` is: reloading the page, or opening it
 * in a second tab, has to still be paying for the same lot. The two are
 * mutually exclusive — the API refuses a request carrying both — and this one
 * takes precedence on screen, because arriving with it is a deliberate act
 * while an empty cart is not.
 */
export const AUCTION_PARAM = "auction"

/** Cart line ids from the URL, or null for "all of it". */
export function parseSelection(raw: string | null): string[] | null {
  if (!raw) return null
  const ids = raw.split(",").filter(Boolean)
  return ids.length > 0 ? ids : null
}

/**
 * The lines a checkout would charge for.
 *
 * Ids in the URL that are not in the cart are dropped rather than carried into
 * the request: the line may have been removed in another tab, and the API
 * refuses the whole checkout over one that no longer exists. Dropping it here
 * means the screen shows what will actually be paid for.
 */
export function selectedItems(
  cart: Cart,
  selection: string[] | null
): CartItem[] {
  if (!selection) return cart.items
  const wanted = new Set(selection)
  return cart.items.filter((item) => wanted.has(item.id))
}

// Money arrives as `Decimal.toFixed(2)` strings. Adding them as floats is how
// a cart of ฿0.10 lines ends up a satang short, so the arithmetic is done in
// whole satang and formatted back once.
const toSatang = (value: string) => Math.round(Number(value) * 100)

export type CartTotals = {
  itemCount: number
  discountTotal: string
  total: string
  sellerCount: number
}

/**
 * The same four numbers `GET /cart` returns, over a subset of the lines.
 *
 * Recomputed rather than read from `cart.summary`, which is always the whole
 * cart — a summary that counted lines the buyer had unticked would be the
 * screen disagreeing with the charge.
 */
export function totalsOf(items: CartItem[]): CartTotals {
  let itemCount = 0
  let total = 0
  let discount = 0
  const sellers = new Set<string>()

  for (const item of items) {
    itemCount += item.quantity
    total += toSatang(item.subtotal)
    discount += toSatang(item.discountAmount)
    sellers.add(item.seller.id)
  }

  return {
    itemCount,
    discountTotal: (discount / 100).toFixed(2),
    total: (total / 100).toFixed(2),
    sellerCount: sellers.size,
  }
}

/**
 * The href for checking out this selection. Everything selected produces the
 * plain `/checkout`, so the common case leaves no parameter to go stale.
 */
export function checkoutHref(cart: Cart, selected: Set<string>): string {
  if (selected.size === cart.items.length) return "/checkout"
  const ids = cart.items
    .filter((item) => selected.has(item.id))
    .map((item) => item.id)
  return `/checkout?${SELECTION_PARAM}=${ids.join(",")}`
}
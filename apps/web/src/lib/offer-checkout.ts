/**
 * AI-003 — what the checkout screen needs to draw an agreed price, carried
 * across the navigation that takes the buyer there.
 *
 * None of this is in the URL, and that is the point. Everything here is
 * display; a summary that could be edited in the address bar would let the
 * page show one price and the server charge another. The accept token in the
 * URL is the only thing carrying any authority, and `POST /orders/checkout`
 * prices the order from the offer that token names regardless of what is
 * stored here.
 *
 * sessionStorage rather than a query string or a store: it survives the
 * navigation and a refresh of the checkout page, belongs to the one tab that
 * did the negotiating, and is gone when that tab closes — close enough to the
 * offer's own fifteen minutes that nothing here has to expire by hand.
 */
export type OfferHandoff = {
  productId: string
  title: string
  quantity: number
  /** The agreed price per unit — the buyer's own accepted offer amount. */
  unitPrice: number
  /** When the offer stops being payable, straight from the API. */
  expiresAt: string | null
}

/**
 * One slot rather than one per token: a buyer is paying for one agreed price
 * at a time, and a keyed store would accumulate the losers of every
 * negotiation that never reached checkout.
 */
const KEY = "bidnest:pending-offer"

type Stored = { token: string; offer: OfferHandoff }

export function rememberOffer(token: string, offer: OfferHandoff): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ token, offer } satisfies Stored))
  } catch {
    // Private windows and blocked site data both throw here. The checkout
    // screen already has to cope with finding nothing, so there is nothing to
    // report: the buyer is told what to do when they arrive.
  }
}

/**
 * The slot exactly as stored, or null.
 *
 * A string rather than the parsed object on purpose: this is the snapshot
 * `useSyncExternalStore` compares between renders, and handing it a freshly
 * parsed object every time would look like a change on every render and loop.
 * Parsing is `parseOffer`'s job, behind a `useMemo`.
 */
export function readOfferSnapshot(): string | null {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

/**
 * The summary for this exact token, or null.
 *
 * The token is compared rather than assumed so a stale slot from an earlier
 * negotiation can never be drawn beside a different offer's payment.
 */
export function parseOffer(raw: string | null, token: string): OfferHandoff | null {
  if (!raw) return null

  try {
    const stored = JSON.parse(raw) as Partial<Stored>
    return stored.token === token && stored.offer ? stored.offer : null
  } catch {
    return null
  }
}

/** Called once the offer has been paid for — it is single-use on the server too. */
export function forgetOffer(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // Same as above: nothing here is worth interrupting a finished payment for.
  }
}

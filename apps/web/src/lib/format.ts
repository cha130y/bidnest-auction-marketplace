const baht = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  minimumFractionDigits: 2,
})

const dateTime = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "medium",
  timeStyle: "short",
})

const dateOnly = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" })

/**
 * Money always arrives from the API as a string (Prisma Decimal). Parse at the
 * edge, here, so no caller is tempted to do arithmetic on it — every total is
 * computed server-side (CART-002).
 */
export function formatTHB(amount: string | number): string {
  const value = typeof amount === "number" ? amount : Number(amount)
  return Number.isFinite(value) ? baht.format(value) : "—"
}

export function formatDateTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? "—" : dateTime.format(date)
}

export function formatDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? "—" : dateOnly.format(date)
}

/** "10.00" → "10%" — trims the trailing zeros the API sends on percentages. */
export function formatPercent(percent: string | number): string {
  const value = typeof percent === "number" ? percent : Number(percent)
  return Number.isFinite(value) ? `${value}%` : "—"
}

/**
 * The initial on an avatar, for an account with no picture. Falls back to the
 * address when there is no name, and to "?" when there is neither — both
 * columns are NOT NULL, but a session read mid-refresh can still arrive empty.
 */
export function initialOf(name?: string | null, email?: string | null): string {
  const source = name?.trim() || email?.trim() || "?"
  return source.charAt(0).toUpperCase()
}

/**
 * Where an order line opens.
 *
 * A line can be a shop product or a won auction, and the two live on opposite
 * halves of the site. Kept here rather than inline at each of the four order
 * screens, so adding a third kind one day is one edit and not a hunt for the
 * ones that were missed.
 */
export function listingHref(listing: {
  kind: "PRODUCT" | "AUCTION"
  id: string
}): string {
  return listing.kind === "AUCTION"
    ? `/auctions/${listing.id}`
    : `/shop/${listing.id}`
}

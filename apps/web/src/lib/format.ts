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

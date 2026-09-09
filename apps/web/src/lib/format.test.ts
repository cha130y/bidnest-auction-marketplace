import { describe, expect, it } from "vitest"

import {
  formatDate,
  formatDateTime,
  formatPercent,
  formatTHB,
  initialOf,
  listingHref,
} from "@/lib/format"

/**
 * The formatted output itself is only asserted where it does not depend on
 * ICU: `th-TH` dates render in the Buddhist era on one ICU build and not on
 * another, and the currency symbol has moved between them. What every one of
 * these is really guarding is the fallback — a screen that prints `NaN` or
 * `Invalid Date` at a buyer is the failure worth catching.
 */
describe("formatTHB", () => {
  it("formats a Decimal string with two places and thousands separators", () => {
    expect(formatTHB("1234.5")).toContain("1,234.50")
  })

  it("formats a number the same way it formats its string", () => {
    expect(formatTHB(1234.5)).toBe(formatTHB("1234.5"))
  })

  it("shows a dash rather than NaN when the amount is not a number", () => {
    expect(formatTHB("not money")).toBe("—")
    expect(formatTHB(Number.NaN)).toBe("—")
    expect(formatTHB(Number.POSITIVE_INFINITY)).toBe("—")
  })

  /**
   * `Number("")` is 0, not NaN, so a blank amount reads as free rather than as
   * unknown. Every monetary column is NOT NULL and serialised with
   * `.toFixed(2)`, so a blank one would be an API bug — pinned here because
   * the screen quotes a price at the buyer instead of saying anything is
   * wrong, and that is worth knowing before it is worth changing.
   */
  it("reads a blank amount as zero rather than as missing", () => {
    expect(formatTHB("")).toContain("0.00")
  })
})

describe("formatDateTime / formatDate", () => {
  const valid = new Date("2026-09-09T10:30:00.000Z")

  it("formats a Date and an ISO string alike", () => {
    expect(formatDateTime(valid)).toBe(
      formatDateTime("2026-09-09T10:30:00.000Z")
    )
    expect(formatDate(valid)).toBe(formatDate("2026-09-09T10:30:00.000Z"))
  })

  it("shows a dash rather than Invalid Date", () => {
    expect(formatDateTime("tomorrow-ish")).toBe("—")
    expect(formatDate("tomorrow-ish")).toBe("—")
    expect(formatDateTime(new Date("nope"))).toBe("—")
  })
})

describe("formatPercent", () => {
  it("trims the trailing zeros the API sends", () => {
    expect(formatPercent("10.00")).toBe("10%")
    expect(formatPercent("7.50")).toBe("7.5%")
    expect(formatPercent(0)).toBe("0%")
  })

  it("shows a dash when the percentage is not a number", () => {
    expect(formatPercent("half")).toBe("—")
    expect(formatPercent(Number.NaN)).toBe("—")
  })

  it("reads a blank percentage as zero, the way a blank amount reads", () => {
    expect(formatPercent("")).toBe("0%")
  })
})

describe("initialOf", () => {
  it("takes the first letter of the name, upper-cased", () => {
    expect(initialOf("somchai")).toBe("S")
  })

  it("falls back to the address when there is no name", () => {
    expect(initialOf(null, "buyer@example.com")).toBe("B")
    expect(initialOf("   ", "buyer@example.com")).toBe("B")
  })

  it("falls back to a question mark when there is neither", () => {
    expect(initialOf()).toBe("?")
    expect(initialOf(null, null)).toBe("?")
    expect(initialOf("  ", "  ")).toBe("?")
  })
})

describe("listingHref", () => {
  it("sends the two kinds of line to opposite halves of the site", () => {
    expect(listingHref({ kind: "AUCTION", id: "a1" })).toBe("/auctions/a1")
    expect(listingHref({ kind: "PRODUCT", id: "p1" })).toBe("/shop/p1")
  })
})

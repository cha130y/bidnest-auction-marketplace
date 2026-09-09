import { describe, expect, it } from "vitest"

import {
  SELECTION_PARAM,
  checkoutHref,
  parseSelection,
  selectedItems,
  totalsOf,
} from "@/lib/cart-selection"
import type { Cart, CartItem } from "@/lib/api/types"

const item = (id: string, overrides: Partial<CartItem> = {}): CartItem => ({
  id,
  quantity: 1,
  product: {
    id: `p-${id}`,
    title: `Product ${id}`,
    status: "ACTIVE",
    stockQty: 10,
    imageUrl: null,
  },
  seller: { id: "seller-1", displayName: "Somchai Shop" },
  unitPrice: "100.00",
  effectiveUnitPrice: "100.00",
  discountPercent: null,
  discountAmount: "0.00",
  subtotal: "100.00",
  issue: null,
  ...overrides,
})

/** `summary` is deliberately wrong here: nothing under test may read it. */
const cartOf = (items: CartItem[]): Cart => ({
  items,
  sellerCount: new Set(items.map((line) => line.seller.id)).size,
  summary: { itemCount: 999, discountTotal: "999.00", total: "999.00" },
})

describe("parseSelection", () => {
  it("reads the ids the URL carries", () => {
    expect(parseSelection("a,b")).toEqual(["a", "b"])
  })

  it("treats an absent parameter as the whole cart", () => {
    expect(parseSelection(null)).toBeNull()
    expect(parseSelection("")).toBeNull()
  })

  /**
   * A parameter that survives to here with nothing in it has to mean the whole
   * cart too, not an empty checkout: `selectedItems` reads `null` as "all of
   * it", and an empty array would charge for nothing.
   */
  it("treats a parameter of nothing but separators as the whole cart", () => {
    expect(parseSelection(",,,")).toBeNull()
  })

  it("drops the empty stretches a trailing or doubled comma leaves", () => {
    expect(parseSelection("a,,b,")).toEqual(["a", "b"])
  })
})

describe("selectedItems", () => {
  const cart = cartOf([item("a"), item("b"), item("c")])

  it("charges for the whole cart when nothing was selected", () => {
    expect(selectedItems(cart, null)).toEqual(cart.items)
  })

  it("charges for exactly the lines named", () => {
    expect(selectedItems(cart, ["b"]).map((line) => line.id)).toEqual(["b"])
  })

  /**
   * The line may have been removed in another tab, and the API refuses the
   * whole checkout over one id that no longer exists. Dropping it here is what
   * keeps the screen showing what will actually be paid for.
   */
  it("drops an id that is no longer in the cart", () => {
    expect(selectedItems(cart, ["b", "ghost"]).map((line) => line.id)).toEqual([
      "b",
    ])
  })

  it("keeps cart order rather than the order the URL happened to list", () => {
    expect(selectedItems(cart, ["c", "a"]).map((line) => line.id)).toEqual([
      "a",
      "c",
    ])
  })
})

describe("totalsOf", () => {
  it("adds up nothing without producing NaN", () => {
    expect(totalsOf([])).toEqual({
      itemCount: 0,
      discountTotal: "0.00",
      total: "0.00",
      sellerCount: 0,
    })
  })

  it("totals the subtotals and the savings to the satang", () => {
    const totals = totalsOf([
      item("a", { subtotal: "19.99", discountAmount: "0.01" }),
      item("b", { subtotal: "1234.56", discountAmount: "137.17" }),
      item("c", { subtotal: "0.01", discountAmount: "0.00" }),
    ])

    expect(totals.total).toBe("1254.56")
    expect(totals.discountTotal).toBe("137.18")
  })

  it("counts pieces rather than lines", () => {
    const totals = totalsOf([
      item("a", { quantity: 3 }),
      item("b", { quantity: 2 }),
    ])

    expect(totals.itemCount).toBe(5)
  })

  /** CART-003 — more than one seller is what splits a checkout into orders. */
  it("counts each seller once however many lines they have", () => {
    const totals = totalsOf([
      item("a"),
      item("b"),
      item("c", { seller: { id: "seller-2", displayName: "Malee" } }),
    ])

    expect(totals.sellerCount).toBe(2)
  })
})

describe("checkoutHref", () => {
  const cart = cartOf([item("a"), item("b"), item("c")])

  it("leaves no parameter to go stale when everything is selected", () => {
    expect(checkoutHref(cart, new Set(["a", "b", "c"]))).toBe("/checkout")
  })

  it("names the selection in cart order, not tick order", () => {
    expect(checkoutHref(cart, new Set(["c", "a"]))).toBe(
      `/checkout?${SELECTION_PARAM}=a,c`
    )
  })

  /**
   * The whole chain, because this is the one the buyer pays for: what the cart
   * links to has to be what the checkout charges for. `cartItemIds` in
   * checkout-view is built straight off the far end of this.
   */
  it("round-trips a partial selection back to the same lines", () => {
    const href = checkoutHref(cart, new Set(["a", "c"]))
    const raw = new URL(href, "http://localhost").searchParams.get(
      SELECTION_PARAM
    )

    expect(selectedItems(cart, parseSelection(raw)).map((l) => l.id)).toEqual([
      "a",
      "c",
    ])
  })
})

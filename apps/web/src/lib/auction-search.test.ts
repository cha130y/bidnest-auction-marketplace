import { describe, expect, it } from "vitest"

import {
  auctionHref,
  hasAuctionFilters,
  parseAuctionSearch,
} from "@/lib/auction-search"
import type { AuctionSearch } from "@/lib/auction-search"

const CATEGORY_A = "00000000-0000-4000-8000-000000000101"
const CATEGORY_B = "00000000-0000-4000-8000-000000000102"

const search = (overrides: Partial<AuctionSearch> = {}): AuctionSearch => ({
  section: "hot",
  categoryIds: [],
  page: 1,
  ...overrides,
})

describe("parseAuctionSearch", () => {
  it("reads a bare /auctions as the first page of the first section", () => {
    expect(parseAuctionSearch({})).toEqual({
      section: "hot",
      q: undefined,
      categoryIds: [],
      minPrice: undefined,
      maxPrice: undefined,
      page: 1,
    })
  })

  it("keeps a section the tab strip actually offers", () => {
    expect(parseAuctionSearch({ section: "ending-soon" }).section).toBe(
      "ending-soon"
    )
  })

  /**
   * Deliberately the opposite of the API, which 400s on an unknown section.
   * A hand-edited URL comes from a person, not a program, and a page of
   * results beats an error box — so the junk never reaches the API at all.
   */
  it("falls back to hot rather than passing an unknown section on", () => {
    expect(parseAuctionSearch({ section: "trending" }).section).toBe("hot")
  })

  describe("page", () => {
    it("reads a page number", () => {
      expect(parseAuctionSearch({ page: "3" }).page).toBe(3)
    })

    it("floors a fractional page rather than sending it on", () => {
      expect(parseAuctionSearch({ page: "2.9" }).page).toBe(2)
    })

    it("falls back to the first page for anything below one or unreadable", () => {
      expect(parseAuctionSearch({ page: "0" }).page).toBe(1)
      expect(parseAuctionSearch({ page: "-4" }).page).toBe(1)
      expect(parseAuctionSearch({ page: "last" }).page).toBe(1)
    })
  })

  describe("q", () => {
    it("trims the term", () => {
      expect(parseAuctionSearch({ q: "  seiko  " }).q).toBe("seiko")
    })

    it("reads a term of nothing but spaces as no term at all", () => {
      expect(parseAuctionSearch({ q: "   " }).q).toBeUndefined()
    })
  })

  describe("categoryIds", () => {
    it("reads the comma form buildQuery writes", () => {
      expect(
        parseAuctionSearch({ categoryIds: `${CATEGORY_A},${CATEGORY_B}` })
          .categoryIds
      ).toEqual([CATEGORY_A, CATEGORY_B])
    })

    it("reads the repeated-key form an older or hand-written URL may use", () => {
      expect(
        parseAuctionSearch({ categoryIds: [CATEGORY_A, CATEGORY_B] })
          .categoryIds
      ).toEqual([CATEGORY_A, CATEGORY_B])
    })

    /**
     * Every id here was put in the URL by a checkbox, so anything malformed is
     * a typed address. Dropping it is what stops the visitor being shown a
     * validation message from the API asking whether the API is running.
     */
    it("drops anything that is not a v4 uuid", () => {
      expect(
        parseAuctionSearch({
          categoryIds: `${CATEGORY_A},not-a-uuid,00000000-0000-1000-8000-000000000101`,
        }).categoryIds
      ).toEqual([CATEGORY_A])
    })
  })

  describe("minPrice / maxPrice", () => {
    it("reads a price", () => {
      expect(parseAuctionSearch({ minPrice: "1000" }).minPrice).toBe(1000)
      expect(parseAuctionSearch({ maxPrice: "5000" }).maxPrice).toBe(5000)
    })

    it("keeps a floor of zero, which is a filter like any other", () => {
      expect(parseAuctionSearch({ minPrice: "0" }).minPrice).toBe(0)
    })

    it("drops a negative or unreadable price rather than 400ing on it", () => {
      expect(parseAuctionSearch({ minPrice: "-5" }).minPrice).toBeUndefined()
      expect(parseAuctionSearch({ maxPrice: "cheap" }).maxPrice).toBeUndefined()
    })
  })
})

describe("hasAuctionFilters", () => {
  it("is false for a section nobody has narrowed", () => {
    expect(hasAuctionFilters(search())).toBe(false)
    expect(hasAuctionFilters(search({ section: "ending-soon", page: 4 }))).toBe(
      false
    )
  })

  it("is true for each of the four filters on its own", () => {
    expect(hasAuctionFilters(search({ q: "seiko" }))).toBe(true)
    expect(hasAuctionFilters(search({ categoryIds: [CATEGORY_A] }))).toBe(true)
    expect(hasAuctionFilters(search({ minPrice: 0 }))).toBe(true)
    expect(hasAuctionFilters(search({ maxPrice: 5000 }))).toBe(true)
  })
})

describe("auctionHref", () => {
  it("leaves the defaults out, so a plain /auctions is what gets shared", () => {
    expect(auctionHref(search())).toBe("/auctions")
  })

  it("names a section that is not the default", () => {
    expect(auctionHref(search({ section: "ending-soon" }))).toBe(
      "/auctions?section=ending-soon"
    )
  })

  /** Page 5 of the old filter rarely exists under the new one. */
  it("resets to page 1 on any change that is not paging", () => {
    expect(auctionHref(search({ page: 5 }), { q: "seiko" })).toBe(
      "/auctions?q=seiko"
    )
  })

  it("keeps the page when paging is the change", () => {
    expect(auctionHref(search({ page: 5 }), { page: 3 })).toBe(
      "/auctions?page=3"
    )
  })

  /**
   * Somebody who narrowed to watches under ฿5,000 and then looked at what is
   * closing soon still means watches under ฿5,000.
   */
  it("carries the filters across a change of section", () => {
    expect(
      auctionHref(search({ q: "seiko", maxPrice: 5000 }), {
        section: "ending-soon",
      })
    ).toBe("/auctions?section=ending-soon&q=seiko&maxPrice=5000")
  })

  it("writes the categories as one comma-joined parameter", () => {
    expect(auctionHref(search({ categoryIds: [CATEGORY_A, CATEGORY_B] }))).toBe(
      `/auctions?categoryIds=${CATEGORY_A}%2C${CATEGORY_B}`
    )
  })
})

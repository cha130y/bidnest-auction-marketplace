import { describe, expect, it } from "vitest"

import { pageWindow } from "@/lib/pagination"

describe("pageWindow", () => {
  it("shows every page when they all fit inside the window", () => {
    expect(pageWindow(3, 5)).toEqual([1, 2, 3, 4, 5])
  })

  it("collapses only the runs that are actually broken", () => {
    expect(pageWindow(1, 5)).toEqual([1, 2, "gap", 5])
    expect(pageWindow(10, 10)).toEqual([1, "gap", 9, 10])
  })

  it("puts a gap on each side when the current page sits in the middle", () => {
    expect(pageWindow(5, 10)).toEqual([1, "gap", 4, 5, 6, "gap", 10])
  })

  it("never repeats a page when first, last and current overlap", () => {
    expect(pageWindow(1, 1)).toEqual([1])
    expect(pageWindow(2, 2)).toEqual([1, 2])
  })

  it("returns nothing to page through when there are no pages", () => {
    expect(pageWindow(1, 0)).toEqual([])
  })
})

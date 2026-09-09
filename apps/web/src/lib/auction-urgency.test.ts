import { describe, expect, it } from "vitest"

import { describeUrgency } from "@/lib/auction-urgency"
import type { SuddenDeath } from "@/lib/api/types"

const suddenDeath = (overrides: Partial<SuddenDeath> = {}): SuddenDeath => ({
  active: false,
  windowMs: 120_000,
  extensionMs: 120_000,
  extensionCount: 0,
  extensionsRemaining: 5,
  lastExtension: null,
  ...overrides,
})

describe("describeUrgency", () => {
  it("stays calm while nothing is close", () => {
    expect(describeUrgency(suddenDeath(), true)).toBe("calm")
  })

  it("is closing inside the window, before anybody has bid into it", () => {
    expect(describeUrgency(suddenDeath({ active: true }), true)).toBe("closing")
  })

  it("is sudden death once the deadline has been moved", () => {
    expect(
      describeUrgency(suddenDeath({ active: true, extensionCount: 1 }), true)
    ).toBe("suddenDeath")
  })

  /**
   * The regression the module's own comment describes. An extension is
   * measured from the old deadline and is as long as the window, so a bid at
   * 0:01 leaves 2:01 on the clock — outside `active`, with the deadline
   * already moved once. Reading `active` here put that screen back to
   * "closing", which tells the bidder the opposite of what is true.
   */
  it("stays sudden death after the extension has pushed the clock back out of the window", () => {
    expect(
      describeUrgency(suddenDeath({ active: false, extensionCount: 1 }), true)
    ).toBe("suddenDeath")
  })

  it("shows no urgency at all once bidding is closed, however the window looks", () => {
    expect(
      describeUrgency(suddenDeath({ active: true, extensionCount: 3 }), false)
    ).toBe("calm")
  })
})

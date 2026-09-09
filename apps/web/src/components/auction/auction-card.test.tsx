import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AuctionCard } from "@/components/auction/auction-card"
import { useAuthToken } from "@/lib/api/auth/use-auth-token"
import { apiFetch } from "@/lib/api/client"
import type { Auction } from "@/lib/api/types"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock("@/lib/api/auth/use-auth-token", () => ({
  useAuthToken: vi.fn(),
}))

vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  apiFetch: vi.fn(),
}))

/**
 * The chip runs a live countdown on an interval, which is its own concern and
 * its own test. Standing it in keeps this file about what the card decides:
 * which price to lead with, and which date belongs to which status.
 */
vi.mock("@/components/auction/auction-countdown-chip", () => ({
  AuctionCountdownChip: () => <span>countdown</span>,
}))

/** The fields the card reads. A full `Auction` is twenty-six. */
const auctionOf = (overrides: Partial<Auction> = {}) =>
  ({
    id: "auction-1",
    title: "Vintage Seiko 5",
    status: "ACTIVE",
    startingPrice: "3000.00",
    currentPrice: "0.00",
    soldPrice: null,
    bidCount: 0,
    scheduledStartAt: null,
    currentEndAt: null,
    endedAt: null,
    category: { id: "c1", name: "Watches", slug: "watches" },
    seller: { id: "s1", displayName: "Somchai Shop" },
    images: [],
    ...overrides,
  }) as unknown as Auction

const renderCard = (auction: Auction) => {
  vi.mocked(useAuthToken).mockReturnValue({ token: null, ready: true })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <AuctionCard auction={auction} />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(apiFetch).mockResolvedValue(undefined as never)
})

describe("AuctionCard", () => {
  /**
   * `currentPrice` is 0 before the first bid, and that means "no price yet",
   * not "free". Leading with it would quote ฿0.00 at a buyer on every auction
   * nobody has bid on yet.
   */
  describe("the price it leads with", () => {
    it("is the starting price before anybody has bid", () => {
      renderCard(auctionOf({ bidCount: 0, startingPrice: "3000.00" }))

      expect(screen.getByText("ราคาเริ่มต้น")).toBeInTheDocument()
      expect(screen.getByText("฿3,000.00")).toBeInTheDocument()
      expect(screen.getByText("ยังไม่มีผู้เสนอราคา")).toBeInTheDocument()
    })

    it("is the current price once bidding has started", () => {
      renderCard(
        auctionOf({ bidCount: 3, currentPrice: "3300.00", currentEndAt: null })
      )

      expect(screen.getByText("ราคาปัจจุบัน")).toBeInTheDocument()
      expect(screen.getByText("฿3,300.00")).toBeInTheDocument()
      expect(screen.getByText("เสนอราคาแล้ว 3 ครั้ง")).toBeInTheDocument()
    })

    /** LIV-004 — what somebody actually paid is the headline once it is sold. */
    it("is what it sold for once it is sold", () => {
      renderCard(
        auctionOf({
          status: "SOLD",
          bidCount: 7,
          currentPrice: "4200.00",
          soldPrice: "4200.00",
          endedAt: "2026-09-01T10:00:00.000Z",
        })
      )

      expect(screen.getByText("ราคาปิด")).toBeInTheDocument()
      expect(screen.getByText("฿4,200.00")).toBeInTheDocument()
    })

    it("falls back to the bidding price when a sold auction carries no sold price", () => {
      renderCard(
        auctionOf({
          status: "SOLD",
          bidCount: 7,
          currentPrice: "4200.00",
          soldPrice: null,
          endedAt: "2026-09-01T10:00:00.000Z",
        })
      )

      expect(screen.getByText("ราคาปัจจุบัน")).toBeInTheDocument()
      expect(screen.getByText("฿4,200.00")).toBeInTheDocument()
    })
  })

  describe("the status badge", () => {
    it("names each status the list can show", () => {
      renderCard(auctionOf({ status: "SCHEDULED" }))
      expect(screen.getByText("เริ่มเร็วๆ นี้")).toBeInTheDocument()
    })

    it("marks a live auction as live", () => {
      renderCard(auctionOf({ status: "ACTIVE" }))
      expect(screen.getByText("กำลังประมูล")).toBeInTheDocument()
    })

    it("marks one that found no buyer", () => {
      renderCard(auctionOf({ status: "UNSOLD", endedAt: null }))
      expect(screen.getByText("ไม่มีผู้ชนะ")).toBeInTheDocument()
    })
  })

  /**
   * A card showing "ปิด 14:00" on an auction that finished yesterday would be
   * worse than showing nothing, so each status gets the one date that belongs
   * to it — and says so in words when that date is missing.
   */
  describe("the date it shows", () => {
    it("counts down rather than printing a deadline while the auction is live", () => {
      renderCard(
        auctionOf({ status: "ACTIVE", currentEndAt: "2026-09-10T10:00:00.000Z" })
      )

      expect(screen.getByText("countdown")).toBeInTheDocument()
    })

    it("says when a scheduled auction opens", () => {
      renderCard(
        auctionOf({
          status: "SCHEDULED",
          scheduledStartAt: "2026-09-10T10:00:00.000Z",
        })
      )

      expect(screen.getByText(/^เริ่ม /)).toBeInTheDocument()
    })

    it("says so in words when a scheduled auction has no start time yet", () => {
      renderCard(auctionOf({ status: "SCHEDULED", scheduledStartAt: null }))

      expect(screen.getByText("ยังไม่กำหนดเวลาเริ่ม")).toBeInTheDocument()
    })

    it("says when a finished auction ended", () => {
      renderCard(
        auctionOf({ status: "UNSOLD", endedAt: "2026-09-01T10:00:00.000Z" })
      )

      expect(screen.getByText(/^จบเมื่อ /)).toBeInTheDocument()
    })
  })

  it("points everything on the card at the auction", () => {
    renderCard(auctionOf())

    const links = screen.getAllByRole("link")
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/auctions/auction-1")
    }
  })

  it("names a seller who has set no display name", () => {
    renderCard(auctionOf({ seller: { id: "s1", displayName: null } }))

    expect(screen.getByText("โดย ไม่ระบุชื่อ")).toBeInTheDocument()
  })
})

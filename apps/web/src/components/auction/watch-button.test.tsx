import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  AuctionCardWatchButton,
  WatchButton,
} from "@/components/auction/watch-button"
import { useAuthToken } from "@/lib/api/auth/use-auth-token"
import { ApiError, apiFetch } from "@/lib/api/client"
import {
  auctionWatchlistCountQueryKey,
  auctionWatchlistQueryKey,
} from "@/lib/api/watchlist"
import type { Paginated, WatchlistEntry } from "@/lib/api/types"

const push = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}))

vi.mock("@/lib/api/auth/use-auth-token", () => ({
  useAuthToken: vi.fn(),
}))

/**
 * Stubbed at the network rather than at `@/lib/api/watchlist`, so the query
 * keys, the shared query options and the two mutation functions are all the
 * real ones. A test that mocked the module would still pass if the button and
 * the provider drifted onto different keys — which is the bug that would empty
 * the header's badge while the heart stayed filled.
 */
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  apiFetch: vi.fn(),
}))

const AUCTION_ID = "auction-1"

const entryFor = (auctionId: string) =>
  ({
    watchedAt: "2026-09-01T00:00:00.000Z",
    auction: { id: auctionId },
    countdown: {},
    result: null,
  }) as unknown as WatchlistEntry

const listOf = (auctionIds: string[]): Paginated<WatchlistEntry> => ({
  items: auctionIds.map(entryFor),
  meta: { page: 1, limit: 100, total: auctionIds.length, totalPages: 1 },
})

type Options = {
  watching?: string[]
  token?: string | null
  sessionReady?: boolean
}

function setup(
  ui: (props: { auctionId: string }) => React.ReactElement,
  { watching = [], token = "access-token", sessionReady = true }: Options = {}
) {
  vi.mocked(useAuthToken).mockReturnValue({ token, ready: sessionReady })

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { staleTime: Number.POSITIVE_INFINITY, retry: false },
      mutations: { retry: false },
    },
  })
  queryClient.setQueryData(auctionWatchlistQueryKey, listOf(watching))
  queryClient.setQueryData(auctionWatchlistCountQueryKey, {
    total: watching.length,
  })

  render(
    <QueryClientProvider client={queryClient}>
      {ui({ auctionId: AUCTION_ID })}
    </QueryClientProvider>
  )

  const watchedIds = () =>
    queryClient
      .getQueryData<Paginated<WatchlistEntry>>(auctionWatchlistQueryKey)
      ?.items.map((item) => item.auction.id)

  const watchedCount = () =>
    queryClient.getQueryData<{ total: number }>(auctionWatchlistCountQueryKey)
      ?.total

  return { user: userEvent.setup(), watchedIds, watchedCount }
}

const panel = ({ auctionId }: { auctionId: string }) => (
  <WatchButton auctionId={auctionId} />
)

const cardHeart = ({ auctionId }: { auctionId: string }) => (
  <AuctionCardWatchButton auctionId={auctionId} title="Vintage Seiko 5" />
)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(apiFetch).mockResolvedValue(listOf([]) as never)
})

describe("WatchButton", () => {
  it("sends somebody who is not signed in to login rather than to the API", async () => {
    const { user } = setup(panel, { token: null })

    await user.click(screen.getByRole("button"))

    expect(push).toHaveBeenCalledWith(
      expect.stringContaining("/login?callbackUrl=")
    )
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it("offers to follow an auction the viewer does not follow", () => {
    setup(panel)

    const button = screen.getByRole("button", {
      name: "ติดตามการประมูลนี้",
    })
    expect(button).toHaveAttribute("aria-pressed", "false")
  })

  it("shows an auction the viewer already follows as followed", () => {
    setup(panel, { watching: [AUCTION_ID] })

    const button = screen.getByRole("button", { name: "กำลังติดตาม" })
    expect(button).toHaveAttribute("aria-pressed", "true")
  })

  /**
   * The point of the `ready` flag. Claiming either state before the browser
   * knows the session shows a "sign in" prompt to somebody who is signed in,
   * or an empty heart on an auction they follow — and React reports the
   * mismatch against the server's HTML rather than patching it up.
   */
  it("claims neither state while the session is still resolving", () => {
    setup(panel, { watching: [AUCTION_ID], sessionReady: false })

    expect(screen.getByRole("button")).not.toHaveAttribute("aria-pressed")
  })

  it("follows through the auction's own watchlist route", async () => {
    const { user } = setup(panel)

    await user.click(screen.getByRole("button"))

    expect(apiFetch).toHaveBeenCalledWith(
      `/auctions/${AUCTION_ID}/watchlist`,
      expect.objectContaining({ method: "POST" })
    )
  })

  /**
   * WAT-002 — the card has to leave `/watchlist` on the press, not on the
   * response, and the header's badge is its own query rather than a slice of
   * the list, so it has to be moved by hand or it keeps the old number.
   *
   * The request is left hanging on purpose: what is being asserted is the
   * state *before* the server answers.
   */
  it("takes the auction out of the cached list and count before the request lands", async () => {
    vi.mocked(apiFetch).mockReturnValue(new Promise(() => {}))
    const { user, watchedIds, watchedCount } = setup(panel, {
      watching: [AUCTION_ID, "auction-2"],
    })

    await user.click(screen.getByRole("button"))

    expect(apiFetch).toHaveBeenCalledWith(
      `/auctions/${AUCTION_ID}/watchlist`,
      expect.objectContaining({ method: "DELETE" })
    )
    expect(watchedIds()).toEqual(["auction-2"])
    expect(watchedCount()).toBe(1)
  })

  it("puts the auction back when the server refuses", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(500, "เซิร์ฟเวอร์ขัดข้อง"))
    const { user, watchedIds, watchedCount } = setup(panel, {
      watching: [AUCTION_ID, "auction-2"],
    })

    await user.click(screen.getByRole("button"))

    await waitFor(() => {
      expect(watchedIds()).toEqual([AUCTION_ID, "auction-2"])
    })
    expect(watchedCount()).toBe(2)
  })

  it("says why on the auction's own page", async () => {
    vi.mocked(apiFetch).mockRejectedValue(
      new ApiError(409, "ติดตามรายการนี้ไม่ได้")
    )
    const { user } = setup(panel)

    await user.click(screen.getByRole("button"))

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "ติดตามรายการนี้ไม่ได้"
    )
  })
})

describe("AuctionCardWatchButton", () => {
  it("names the auction it would follow, for a heart with no words on it", () => {
    setup(cardHeart)

    expect(
      screen.getByRole("button", { name: "ติดตาม Vintage Seiko 5" })
    ).toBeInTheDocument()
  })

  it("names the auction it would stop following", () => {
    setup(cardHeart, { watching: [AUCTION_ID] })

    expect(
      screen.getByRole("button", { name: "เลิกติดตาม Vintage Seiko 5" })
    ).toBeInTheDocument()
  })

  /**
   * Deliberately quieter than the panel: there is nowhere on a card to put a
   * sentence without pushing the layout around, and the heart not filling is
   * already the answer.
   */
  it("fails silently, leaving the reason to the auction's own page", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new ApiError(409, "ไม่สำเร็จ"))
    const { user } = setup(cardHeart)

    await user.click(screen.getByRole("button"))

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalled()
    })
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })
})

"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { Heart } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api/client"
import { loginHref } from "@/lib/api/auth/login-redirect"
import { useAuthToken } from "@/lib/api/auth/use-auth-token"
import { listWatchlist, unwatchAuction, watchAuction } from "@/lib/api/watchlist"
import { cn } from "@/lib/utils"

export const auctionWatchlistQueryKey = ["auction-watchlist"] as const

/**
 * WAT-001 — whether the viewer follows this auction, and the toggle for it.
 *
 * The read is one shared query rather than one per button. A browse page
 * renders twenty cards, and twenty copies of a component that each fetched on
 * mount would be twenty identical requests for the same list; under one key
 * React Query collapses them into a single fetch every card reads from. The
 * shop's `useProductWatch` is the same shape for the same reason.
 *
 * That sharing is also what keeps the hearts honest: following an auction
 * invalidates the key, so the card, the auction's own page and the watchlist
 * all change together instead of drifting apart until a reload.
 *
 * Signed-in-ness comes from `useAuthToken` rather than from whether an authed
 * read happened to succeed. Its `ready` flag is the point: it stays false
 * until localStorage has been read after hydration, so nothing renders a
 * "sign in" prompt at somebody who is signed in, nor a filled heart at
 * somebody who is not, while the answer is still unknown.
 */
function useAuctionWatch(auctionId: string) {
  const router = useRouter()
  const { token, ready } = useAuthToken()
  const queryClient = useQueryClient()
  const isAuthenticated = ready && Boolean(token)

  // WAT-002 answers "is this one of mine" without a route of its own. The list
  // is a page long at most here, and the alternative — an endpoint per auction
  // — is a route nobody else needs.
  const { data } = useQuery({
    queryKey: auctionWatchlistQueryKey,
    queryFn: () => listWatchlist({ limit: 100 }),
    enabled: isAuthenticated,
    // A 401 will not fix itself by trying again
    retry: false,
  })

  // Gated on `isAuthenticated` rather than on the data alone, so signing out —
  // in this tab or another — empties the heart without waiting for a refetch.
  const isWatching =
    isAuthenticated &&
    Boolean(data?.items.some((entry) => entry.auction.id === auctionId))

  const mutation = useMutation({
    mutationFn: () =>
      isWatching ? unwatchAuction(auctionId) : watchAuction(auctionId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: auctionWatchlistQueryKey }),
  })

  const toggle = () => {
    if (!token) {
      router.push(loginHref())
      return
    }

    mutation.mutate()
  }

  return {
    isWatching,
    /** False until localStorage has been read, so neither state is claimed early. */
    ready,
    isAuthenticated,
    pending: mutation.isPending,
    error: mutation.error
      ? mutation.error instanceof ApiError
        ? mutation.error.message
        : "ทำรายการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"
      : null,
    toggle,
  }
}

/** WAT-001 — follow or stop following an auction, on its own page. */
export function WatchButton({
  auctionId,
  className,
}: {
  auctionId: string
  className?: string
}) {
  const { isWatching, ready, isAuthenticated, pending, error, toggle } =
    useAuctionWatch(auctionId)

  return (
    <div className={className}>
      <Button
        variant="secondary"
        size="md"
        block
        disabled={pending}
        onClick={toggle}
        aria-pressed={ready && isAuthenticated ? isWatching : undefined}
      >
        <Heart
          className={cn("size-4", isWatching && "fill-amber-500 text-amber-500")}
        />
        {isWatching ? "กำลังติดตาม" : "ติดตามการประมูลนี้"}
      </Button>

      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-red">
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * WAT-001 — the same toggle as a heart in the corner of an auction card.
 *
 * Sits outside the card's link rather than on top of it: a button inside an
 * anchor is invalid HTML, and more to the point a tap meant for the heart
 * would open the auction instead.
 *
 * Failures are silent here, unlike the panel above. There is nowhere on a card
 * to put a sentence without pushing the layout around, and the heart not
 * filling is already the answer — the auction's own page is where a reason
 * belongs.
 *
 * Offered on finished auctions too, which is deliberate rather than an
 * oversight: WAT-001 accepts every public status, and following one that has
 * ended is how somebody keeps its result in front of them.
 */
export function AuctionCardWatchButton({
  auctionId,
  title,
}: {
  auctionId: string
  title: string
}) {
  const { isWatching, ready, isAuthenticated, pending, toggle } =
    useAuctionWatch(auctionId)

  return (
    <Button
      variant="secondary"
      size="icon"
      pill
      className="absolute top-3 right-3 z-10 size-9 border-0 bg-white/95 shadow-sh1 backdrop-blur-sm"
      disabled={pending}
      onClick={toggle}
      aria-pressed={ready && isAuthenticated ? isWatching : undefined}
      aria-label={isWatching ? `เลิกติดตาม ${title}` : `ติดตาม ${title}`}
    >
      <Heart
        className={cn(
          "size-4.5 transition-colors",
          isWatching && "fill-amber-500 text-amber-500"
        )}
      />
    </Button>
  )
}

"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { Heart } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api/client"
import { loginHref } from "@/lib/api/auth/login-redirect"
import { useAuthToken } from "@/lib/api/auth/use-auth-token"
import {
  listProductWatchlist,
  unwatchProduct,
  watchProduct,
} from "@/lib/api/product-watchlist"
import { cn } from "@/lib/utils"

export const productWatchlistQueryKey = ["product-watchlist"] as const

/**
 * Whether the viewer follows this listing, and the toggle for it.
 *
 * The read is one shared query rather than one per button. A catalog page
 * renders twenty cards, and twenty copies of a component that each fetched on
 * mount would be twenty identical requests for the same list; under one key
 * React Query collapses them into a single fetch every card reads from, the
 * way `useCart` does for the header badge and the cart page.
 *
 * That sharing is also what keeps the hearts honest: following a listing
 * invalidates the key, so the card, the detail page, and the watchlist tab all
 * change together instead of drifting apart until a reload.
 */
function useProductWatch(productId: string) {
  const router = useRouter()
  const { token, ready } = useAuthToken()
  const queryClient = useQueryClient()
  const isAuthenticated = ready && Boolean(token)

  const { data } = useQuery({
    queryKey: productWatchlistQueryKey,
    queryFn: () => listProductWatchlist({ limit: 100 }),
    enabled: isAuthenticated,
    // A 401 will not fix itself by trying again
    retry: false,
  })

  // Gated on `isAuthenticated` rather than on the data alone, so signing out —
  // in this tab or another — empties the heart without waiting for a refetch.
  const isWatching =
    isAuthenticated &&
    Boolean(data?.items.some((entry) => entry.product.id === productId))

  const mutation = useMutation({
    mutationFn: () =>
      isWatching ? unwatchProduct(productId) : watchProduct(productId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: productWatchlistQueryKey }),
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

/** Follow or stop following a listing, on its own page — the shop's twin of `WatchButton`. */
export function ProductWatchButton({
  productId,
  className,
}: {
  productId: string
  className?: string
}) {
  const { isWatching, ready, isAuthenticated, pending, error, toggle } =
    useProductWatch(productId)

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
        {isWatching ? "ติดตามอยู่" : "ติดตามสินค้านี้"}
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
 * The same toggle as a heart in the corner of a product card.
 *
 * Sits outside the card's link rather than on top of it: a button inside an
 * anchor is invalid HTML, and more to the point a tap meant for the heart
 * would open the listing instead.
 *
 * Failures are silent here, unlike the panel above. There is nowhere on a card
 * to put a sentence without pushing the layout around, and the heart not
 * filling is already the answer — the panel on the listing's own page is where
 * a reason belongs.
 */
export function ProductCardWatchButton({
  productId,
  title,
}: {
  productId: string
  title: string
}) {
  const { isWatching, ready, isAuthenticated, pending, toggle } =
    useProductWatch(productId)

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
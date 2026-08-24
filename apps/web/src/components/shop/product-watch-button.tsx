"use client"

import { useEffect, useState } from "react"
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

/**
 * Follow or stop following a listing — the shop's twin of `WatchButton`.
 *
 * Signed-in-ness comes from `useAuthToken` rather than from whether an authed
 * read happened to succeed. Its `ready` flag is the point: it stays false until
 * localStorage has been read after hydration, so this renders neither a filled
 * heart at somebody who is signed out nor an empty one at somebody who is
 * signed in, while the answer is still unknown.
 *
 * The followed state is read once on mount rather than passed down, because
 * the product page is server-rendered without a token and cannot know it.
 */
export function ProductWatchButton({
  productId,
  className,
}: {
  productId: string
  className?: string
}) {
  const router = useRouter()
  const { token, ready } = useAuthToken()
  const [watching, setWatching] = useState<boolean | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // No reset when there is no token: signing out is read off `token` at
    // render time instead (see `isWatching`), which keeps this effect a
    // subscription to an external system rather than something that sets state
    // on its way past.
    if (!ready || !token) return

    let cancelled = false

    // The list answers "is this one of mine" without a route of its own. It is
    // a page long at most here, and the alternative — an endpoint per listing
    // — is a route nobody else needs.
    listProductWatchlist({ limit: 100 })
      .then((page) => {
        if (cancelled) return
        setWatching(page.items.some((entry) => entry.product.id === productId))
      })
      .catch(() => {
        // Leaves the button in its unknown state rather than claiming either
        // answer; pressing it still works and the API is the arbiter.
        if (!cancelled) setWatching(null)
      })

    return () => {
      cancelled = true
    }
  }, [productId, ready, token])

  const toggle = async () => {
    if (!token) {
      router.push(loginHref())
      return
    }

    setPending(true)
    setError(null)

    try {
      const result = watching
        ? await unwatchProduct(productId)
        : await watchProduct(productId)
      setWatching(result.watching)
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "ทำรายการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"
      )
    } finally {
      setPending(false)
    }
  }

  // Signing out — in this tab or another — has to empty the heart, and it does
  // so here rather than by clearing state: `useAuthToken` already tracks the
  // storage event, so the token going away is enough.
  const isWatching = Boolean(token) && watching === true

  return (
    <div className={className}>
      <Button
        variant="secondary"
        size="md"
        block
        disabled={pending}
        onClick={() => void toggle()}
        aria-pressed={ready && token ? isWatching : undefined}
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
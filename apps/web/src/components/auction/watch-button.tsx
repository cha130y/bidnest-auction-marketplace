"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Heart } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api/client"
import { loginHref } from "@/lib/api/auth/login-redirect"
import { useAuthToken } from "@/lib/api/auth/use-auth-token"
import { listWatchlist, unwatchAuction, watchAuction } from "@/lib/api/watchlist"
import { cn } from "@/lib/utils"

/**
 * WAT-001 — follow or stop following an auction.
 *
 * Signed-in-ness comes from `useAuthToken` rather than from whether an authed
 * read happened to succeed. Its `ready` flag is the point: it stays false
 * until localStorage has been read after hydration, so this renders neither a
 * "sign in" prompt at somebody who is signed in nor a filled heart at somebody
 * who is not, while the answer is still unknown.
 *
 * The watched state is read once on mount rather than passed down. The auction
 * page is server-rendered without a token, so it cannot know — and the arena's
 * `you` covers participation and bidding, not this.
 */
export function WatchButton({
  auctionId,
  className,
}: {
  auctionId: string
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

    // WAT-002 answers "is this one of mine" without a route of its own. The
    // list is a page long at most here, and the alternative — an endpoint per
    // auction — is a route nobody else needs.
    listWatchlist({ limit: 100 })
      .then((page) => {
        if (cancelled) return
        setWatching(page.items.some((entry) => entry.auction.id === auctionId))
      })
      .catch(() => {
        // Leaves the button in its unknown state rather than claiming either
        // answer; pressing it still works and the API is the arbiter.
        if (!cancelled) setWatching(null)
      })

    return () => {
      cancelled = true
    }
  }, [auctionId, ready, token])

  const toggle = async () => {
    if (!token) {
      router.push(loginHref())
      return
    }

    setPending(true)
    setError(null)

    try {
      const result = watching
        ? await unwatchAuction(auctionId)
        : await watchAuction(auctionId)
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
        onClick={toggle}
        aria-pressed={ready && token ? isWatching : undefined}
      >
        <Heart
          className={cn(
            "size-4",
            isWatching && "fill-amber-500 text-amber-500"
          )}
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

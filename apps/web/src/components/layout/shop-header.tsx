"use client"

import { useCallback } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { SiteHeader } from "@/components/layout/site-header"
import { useCart } from "@/components/cart/cart-provider"
import { useWatchlistCount } from "@/components/watchlist/watchlist-provider"
import { useAuthToken } from "@/lib/api/auth/use-auth-token"
import { unreadNotificationCount } from "@/lib/api/notifications"
import { useUserChannel } from "@/lib/use-user-channel"

export const unreadNotificationsQueryKey = ["notifications", "unread"] as const

/**
 * Wires Dev 1's presentational `SiteHeader` to live badges. Route-based nav
 * state (Auction vs Marketplace) is handled inside `SiteHeader`'s own gavel nav
 * via `usePathname`, so this wrapper only owns what the icons show.
 *
 * The bell asks `/notifications/unread-count` rather than counting a list it
 * would otherwise have to fetch and throw away — the route exists for exactly
 * this. The socket re-reads it: the same `notification:created` event that
 * puts a row in the list is what turns the dot on, so a notification arriving
 * while somebody sits on a page is seen rather than waiting for a navigation.
 * `NotificationList` invalidates the same key after marking rows read, which
 * is what turns it back off.
 *
 * The watchlist badge counts auctions and listings together, because the
 * header carries one heart and `/watchlist` shows both under it.
 */
export function ShopHeader() {
  const { itemCount, isAuthenticated } = useCart()
  const { count: watchlistCount } = useWatchlistCount()
  const { token, ready } = useAuthToken()
  const queryClient = useQueryClient()

  const { data } = useQuery({
    queryKey: unreadNotificationsQueryKey,
    queryFn: unreadNotificationCount,
    enabled: isAuthenticated,
    // A 401 will not fix itself by trying again
    retry: false,
  })

  const reread = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: unreadNotificationsQueryKey })
  }, [queryClient])

  // Fires on connect as well as on every event, so a dot that should already
  // be lit is lit without waiting for something new to happen.
  useUserChannel(ready ? token : null, reread)

  return (
    <SiteHeader
      cartCount={itemCount}
      watchlistCount={watchlistCount}
      notificationCount={data?.unread ?? 0}
      isAuthenticated={isAuthenticated}
    />
  )
}
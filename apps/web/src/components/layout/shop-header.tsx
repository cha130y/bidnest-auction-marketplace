"use client"

import { useQuery } from "@tanstack/react-query"

import { SiteHeader } from "@/components/layout/site-header"
import { useCart } from "@/components/cart/cart-provider"
import { unreadNotificationCount } from "@/lib/api/notifications"

export const unreadNotificationsQueryKey = ["notifications", "unread"] as const

/**
 * Wires Dev 1's presentational `SiteHeader` to live badges. Route-based nav
 * state (Auction vs E-commerce) is handled inside `SiteHeader`'s own gavel nav
 * via `usePathname`, so this wrapper only owns what the icons show.
 *
 * The bell asks `/notifications/unread-count` rather than counting a list it
 * would otherwise have to fetch and throw away — the route exists for exactly
 * this. `NotificationList` marks rows read without React Query, so this cannot
 * be invalidated from there; it does not need to be. `/notifications` sits
 * outside the shop layout, so coming back from it remounts this and refetches.
 *
 * The watchlist badge is ready but not connected: `SiteHeader` has no heart to
 * put it on yet. When one lands, this becomes
 *
 *     const { count } = useWatchlistCount()
 *     return <SiteHeader … watchlistCount={count} />
 *
 * with `watchlistCount?: number` added beside `cartCount` in `SiteHeaderProps`
 * and rendered exactly like the cart badge. `WatchlistProvider` is already
 * mounted above this in the shop layout and already updates when a heart is
 * pressed, so nothing else has to change.
 */
export function ShopHeader() {
  const { itemCount, isAuthenticated } = useCart()

  const { data } = useQuery({
    queryKey: unreadNotificationsQueryKey,
    queryFn: unreadNotificationCount,
    enabled: isAuthenticated,
    // A 401 will not fix itself by trying again
    retry: false,
  })

  return (
    <SiteHeader
      cartCount={itemCount}
      hasNotifications={(data?.unread ?? 0) > 0}
    />
  )
}
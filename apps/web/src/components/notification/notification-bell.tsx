"use client"

import { useCallback, useState } from "react"
import Link from "next/link"
import { Bell } from "lucide-react"

import { unreadNotificationCount } from "@/lib/api/notifications"
import { useAuthToken } from "@/lib/api/auth/use-auth-token"
import { useUserChannel } from "@/lib/use-user-channel"
import { cn } from "@/lib/utils"

/**
 * NOT-001..004 — the bell, with a live unread count.
 *
 * A link rather than a dropdown, deliberately. `components/ui` has no popover
 * primitive, and adding one is a change to the design system rather than to
 * this feature — Dev 1's call, not something to decide by needing it. The list
 * lives at `/notifications`, where it has room to be read properly, and this
 * stays small enough to drop into a header in one line.
 *
 * Renders nothing at all when nobody is signed in. A bell that cannot have
 * anything in it is not worth the space, and `useAuthToken`'s `ready` flag
 * keeps it from flickering into view during hydration.
 *
 * The count is the account's whole unread total, across auctions, orders and
 * messages alike — the API keeps it as one number on purpose, so the badge
 * means "you have things waiting" rather than "you have auction things
 * waiting".
 */
export function NotificationBell({ className }: { className?: string }) {
  const { token, ready } = useAuthToken()
  const [unread, setUnread] = useState(0)

  const refresh = useCallback(() => {
    unreadNotificationCount()
      .then((result) => setUnread(result.unread))
      .catch(() => {
        // A bell that cannot reach the API shows no badge rather than a stale
        // one; nothing else on the page depends on this.
      })
  }, [])

  // Runs on connect as well as on every event, so the count is right on first
  // paint without a separate read.
  useUserChannel(ready ? token : null, refresh)

  if (!ready || !token) return null

  return (
    <Link
      href="/notifications"
      aria-label={
        unread > 0 ? `การแจ้งเตือน ${unread} รายการที่ยังไม่ได้อ่าน` : "การแจ้งเตือน"
      }
      className={cn("relative inline-flex text-ink", className)}
    >
      <Bell className="size-6" />
      {unread > 0 && (
        <span
          className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-ink"
          // The label above already says the number; this would repeat it.
          aria-hidden="true"
        >
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  )
}

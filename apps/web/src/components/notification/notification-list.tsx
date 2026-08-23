"use client"

import { useCallback, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Gavel, Package, MessageSquare, Trophy, XCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api/client"
import { loginHref } from "@/lib/api/auth/login-redirect"
import { useAuthToken } from "@/lib/api/auth/use-auth-token"
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/api/notifications"
import { useUserChannel } from "@/lib/use-user-channel"
import { formatDateTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { AppNotification, NotificationPage } from "@/lib/api/types"

/**
 * An icon per kind. No text: `title` and `message` are written by the API and
 * are already readable, so nothing here composes copy from `type` — which also
 * means the four kinds belonging to the e-commerce and chat modules render
 * correctly without this file knowing anything about them.
 */
const ICON: Record<AppNotification["type"], typeof Gavel> = {
  OUTBID: Gavel,
  AUCTION_WON: Trophy,
  AUCTION_ENDED: Gavel,
  AUCTION_CANCELLED: XCircle,
  ORDER_PLACED: Package,
  SHIPMENT_UPDATE: Package,
  DELIVERED: Package,
  NEW_MESSAGE: MessageSquare,
}

/**
 * Where a row leads, or null for nowhere.
 *
 * Only the auction rows link, because only the auction routes exist. An order
 * or a conversation has no page in `apps/web` yet — those belong to the
 * e-commerce and chat modules — and a link to a 404 is worse than a row that
 * simply does not move when pressed. When those pages land, this map is where
 * they get wired in.
 */
function destination(notification: AppNotification): string | null {
  return notification.auctionId ? `/auctions/${notification.auctionId}` : null
}

export function NotificationList() {
  const router = useRouter()
  const { token, ready } = useAuthToken()
  const [page, setPage] = useState<NotificationPage | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(() => {
    listNotifications({ limit: 30 })
      .then((result) => {
        setPage(result)
        setError(null)
      })
      .catch((caught: unknown) => setError(caught))
  }, [])

  // Reads on connect and on every event, so an outbid notification appears
  // while the page is open rather than on the next reload.
  useUserChannel(ready ? token : null, refresh)

  if (!ready) return <Skeleton />

  if (!token) {
    return (
      <div className="rounded-r4 bg-white px-6 py-16 text-center shadow-sh1">
        <p className="text-n-600">เข้าสู่ระบบเพื่อดูการแจ้งเตือนของคุณ</p>
        <Button
          variant="primary"
          size="lg"
          className="mt-4"
          onClick={() => router.push(loginHref())}
        >
          เข้าสู่ระบบ
        </Button>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-r4 border border-red bg-red-50 px-6 py-8 text-center">
        <p className="font-semibold text-red">
          {error instanceof ApiError
            ? error.message
            : "โหลดการแจ้งเตือนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"}
        </p>
      </div>
    )
  }

  if (!page) return <Skeleton />

  if (page.items.length === 0) {
    return (
      <p className="rounded-r4 bg-white px-6 py-16 text-center text-n-500 shadow-sh1">
        ยังไม่มีการแจ้งเตือน
      </p>
    )
  }

  const readOne = async (notification: AppNotification) => {
    if (notification.readAt) return
    try {
      await markNotificationRead(notification.id)
      refresh()
    } catch {
      // The row stays unread and the page stays usable; pressing again retries
    }
  }

  const readAll = async () => {
    setBusy(true)
    try {
      await markAllNotificationsRead()
      refresh()
    } catch {
      // as above
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-r4 bg-white px-5 py-4 shadow-sh1">
        <span className="text-sm text-n-600">
          {page.unread > 0
            ? `ยังไม่ได้อ่าน ${page.unread.toLocaleString("th-TH")} รายการ`
            : "อ่านครบแล้ว"}
        </span>
        {page.unread > 0 && (
          <Button
            variant="secondary"
            size="md"
            disabled={busy}
            onClick={readAll}
          >
            {busy ? "กำลังทำเครื่องหมาย…" : "ทำเครื่องหมายว่าอ่านแล้วทั้งหมด"}
          </Button>
        )}
      </div>

      <ol className="mt-4 overflow-hidden rounded-r4 bg-white shadow-sh1">
        {page.items.map((notification) => {
          const Icon = ICON[notification.type]
          const href = destination(notification)
          const unread = notification.readAt === null

          const body = (
            <div className="flex items-start gap-3 px-5 py-4">
              <span
                className={cn(
                  "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
                  unread ? "bg-amber-50 text-amber-600" : "bg-n-100 text-n-500"
                )}
              >
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-sm",
                    unread ? "font-semibold text-ink" : "text-n-600"
                  )}
                >
                  {notification.title}
                </p>
                <p className="mt-0.5 text-sm text-n-600">
                  {notification.message}
                </p>
                <p className="mt-1 text-xs text-n-500">
                  {formatDateTime(notification.createdAt)}
                </p>
              </div>
              {unread && (
                <span
                  className="mt-2 size-2 shrink-0 rounded-full bg-amber-500"
                  aria-label="ยังไม่ได้อ่าน"
                />
              )}
            </div>
          )

          return (
            <li
              key={notification.id}
              className="border-b border-n-200 last:border-b-0"
            >
              {href ? (
                <Link
                  href={href}
                  onClick={() => void readOne(notification)}
                  className="block transition-colors hover:bg-n-100"
                >
                  {body}
                </Link>
              ) : (
                // Nothing to open yet — see `destination`. Still markable as
                // read, so the badge can be cleared.
                <button
                  type="button"
                  onClick={() => void readOne(notification)}
                  className="block w-full text-left transition-colors hover:bg-n-100"
                >
                  {body}
                </button>
              )}
            </li>
          )
        })}
      </ol>
    </>
  )
}

function Skeleton() {
  return (
    <div
      className="overflow-hidden rounded-r4 bg-white shadow-sh1"
      aria-hidden="true"
    >
      {Array.from({ length: 5 }, (_, index) => (
        <div
          key={index}
          className="flex items-start gap-3 border-b border-n-200 px-5 py-4 last:border-b-0"
        >
          <div className="size-8 shrink-0 rounded-full bg-n-100 motion-safe:animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-2/5 rounded-full bg-n-100 motion-safe:animate-pulse" />
            <div className="h-3 w-4/5 rounded-full bg-n-100 motion-safe:animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  )
}

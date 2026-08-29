"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import {
  ChevronDown,
  Gavel,
  MessageSquare,
  Package,
  PackageCheck,
  Trophy,
  Truck,
  XCircle,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { unreadNotificationsQueryKey } from "@/components/layout/shop-header"
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
 * A Thai heading per kind.
 *
 * This file used to show the API's own `title`, on the reasoning that the copy
 * belonged to whichever module wrote the row. What that produced on screen was
 * "You have been outbid" and "New order received" sitting in a Thai interface
 * — every heading on the page in the wrong language.
 *
 * The decoupling it was protecting was never real either: `ICON` below is
 * already a map over all eight kinds, so this file has always had to know
 * every one of them. `Record` rather than a lookup with a fallback keeps that
 * honest — a ninth kind is a build error here, not a blank row in production.
 *
 * The API's `message` is still shown underneath, unchanged. That half is the
 * detail — which auction, how much, which order — and is written where the
 * facts are.
 */
const LABEL: Record<AppNotification["type"], string> = {
  OUTBID: "มีคนเสนอราคาแซงคุณ",
  AUCTION_WON: "คุณชนะการประมูล",
  AUCTION_ENDED: "การประมูลจบลงแล้ว",
  AUCTION_CANCELLED: "การประมูลถูกยกเลิก",
  ORDER_PLACED: "คำสั่งซื้อ",
  SHIPMENT_UPDATE: "สถานะการจัดส่ง",
  DELIVERED: "จัดส่งสำเร็จ",
  NEW_MESSAGE: "ข้อความใหม่",
}

const ICON: Record<AppNotification["type"], typeof Gavel> = {
  OUTBID: Gavel,
  AUCTION_WON: Trophy,
  AUCTION_ENDED: Gavel,
  AUCTION_CANCELLED: XCircle,
  ORDER_PLACED: Package,
  SHIPMENT_UPDATE: Truck,
  DELIVERED: PackageCheck,
  NEW_MESSAGE: MessageSquare,
}

/**
 * Colour carries the outcome, so a list can be read by shape before it is read
 * by word: green for the two that went well, red for the one that did not,
 * amber for everything still in motion.
 */
const TONE: Record<AppNotification["type"], string> = {
  OUTBID: "bg-amber-50 text-amber-600",
  AUCTION_WON: "bg-green-50 text-green",
  AUCTION_ENDED: "bg-n-100 text-n-600",
  AUCTION_CANCELLED: "bg-red-50 text-red",
  ORDER_PLACED: "bg-amber-50 text-amber-600",
  SHIPMENT_UPDATE: "bg-amber-50 text-amber-600",
  DELIVERED: "bg-green-50 text-green",
  NEW_MESSAGE: "bg-n-100 text-n-600",
}

/**
 * Where a row leads, or null for nowhere.
 *
 * Order rows used to lead nowhere because `apps/web` had no order detail page.
 * It has had `/orders/[id]` for a while now, and `GET /orders/:id` answers for
 * both the buyer and the seller (SHIP-003), so neither party lands on a 404.
 */
function destination(notification: AppNotification): string | null {
  if (notification.auctionId) return `/auctions/${notification.auctionId}`
  if (notification.conversationId) return `/chat/${notification.conversationId}`
  if (notification.orderId) return `/orders/${notification.orderId}`
  return null
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

/**
 * Order ids reach the message as full UUIDs — "Your order
 * 3a65544f-7890-494f-9705-96b413eca5bc has been paid" — which is 36 characters
 * of noise in the middle of the one sentence a reader is trying to take in.
 * The row links to the order anyway, so the whole id is never needed here;
 * the leading block is enough to tell two of them apart.
 */
function shortenIds(message: string): string {
  return message.replace(UUID, (id) => `#${id.slice(0, 8)}`)
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * "3 ชั่วโมงที่แล้ว" reads faster than "25 ส.ค. 2569 22:07" when the question
 * is "is this new?", which is the question a notification list is for. Past a
 * week the exact date is the more useful answer, so it takes over.
 *
 * Safe to compute at render despite depending on the clock: the rows only
 * exist after the browser has fetched them, so there is no server render to
 * disagree with.
 */
function timeAgo(iso: string): string {
  const elapsed = Date.now() - new Date(iso).getTime()

  if (elapsed < MINUTE) return "เมื่อสักครู่"
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} นาทีที่แล้ว`
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} ชั่วโมงที่แล้ว`
  if (elapsed < 2 * DAY) return "เมื่อวาน"
  if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)} วันที่แล้ว`
  return formatDateTime(iso)
}

const PAGE_SIZE = 20

/**
 * `first`, then whatever of `second` is not already in it.
 *
 * Both directions are needed. Pressing "โหลดเพิ่ม" puts the next page after
 * what is on screen; a notification arriving puts a re-read first page in
 * front of it. Either way a row can appear in both halves — an arrival pushes
 * everything down by one, so the old row 20 becomes the new row 21 — and the
 * id is what keeps it from being drawn twice.
 */
function concatUnique(
  first: AppNotification[],
  second: AppNotification[]
): AppNotification[] {
  const seen = new Set(first.map((item) => item.id))
  return [...first, ...second.filter((item) => !seen.has(item.id))]
}

export function NotificationList() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { token, ready } = useAuthToken()
  const [items, setItems] = useState<AppNotification[] | null>(null)
  const [meta, setMeta] = useState<NotificationPage["meta"] | null>(null)
  const [unread, setUnread] = useState(0)
  const [loadedPages, setLoadedPages] = useState(1)
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [unreadOnly, setUnreadOnly] = useState(false)

  const fetchPage = useCallback(
    (pageNo: number) =>
      listNotifications({
        page: pageNo,
        limit: PAGE_SIZE,
        ...(unreadOnly ? { unreadOnly: true } : {}),
      }),
    [unreadOnly]
  )

  const absorb = useCallback((result: NotificationPage) => {
    setMeta(result.meta)
    setUnread(result.unread)
    setError(null)

    // The header's dot is a React Query read of `/notifications/unread-count`,
    // and this list is not. Marking rows read here would otherwise leave the
    // dot lit above the very page that just cleared them — every path that
    // changes what is unread comes through here, so this is the one place it
    // has to be said.
    void queryClient.invalidateQueries({ queryKey: unreadNotificationsQueryKey })
  }, [queryClient])

  /** Back to the first page, discarding anything loaded past it. */
  const reset = useCallback(() => {
    fetchPage(1)
      .then((result) => {
        setItems(result.items)
        setLoadedPages(1)
        absorb(result)
      })
      .catch((caught: unknown) => setError(caught))
  }, [fetchPage, absorb])

  /**
   * Re-read the first page and fold it into what is on screen, so an arriving
   * notification does not throw away the pages somebody pressed to see.
   */
  const refresh = useCallback(() => {
    fetchPage(1)
      .then((result) => {
        setItems((current) =>
          current ? concatUnique(result.items, current) : result.items
        )
        absorb(result)
      })
      .catch((caught: unknown) => setError(caught))
  }, [fetchPage, absorb])

  const loadMore = () => {
    setLoadingMore(true)
    fetchPage(loadedPages + 1)
      .then((result) => {
        setItems((current) => concatUnique(current ?? [], result.items))
        setLoadedPages(loadedPages + 1)
        absorb(result)
      })
      .catch((caught: unknown) => setError(caught))
      .finally(() => setLoadingMore(false))
  }

  useEffect(() => {
    if (ready && token) reset()
  }, [ready, token, reset])

  // The socket handler reads the latest `refresh` through a ref rather than
  // taking it as a dependency: it changes identity whenever the filter is
  // switched, and a handler that changed with it would tear the socket down
  // and open it again on every press of a filter chip.
  const refreshRef = useRef(refresh)
  useEffect(() => {
    refreshRef.current = refresh
  }, [refresh])
  const onEvent = useCallback(() => refreshRef.current(), [])

  // Reads on connect and on every event, so an outbid notification appears
  // while the page is open rather than on the next reload.
  useUserChannel(ready ? token : null, onEvent)

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

  if (!items || !meta) return <Skeleton />

  /**
   * Patched in place rather than re-read. Re-reading would send the list back
   * to page one, which throws away every "โหลดเพิ่ม" the reader pressed — and
   * a row they touched on page four is the last one they want to lose.
   */
  const readOne = async (notification: AppNotification) => {
    if (notification.readAt) return
    try {
      await markNotificationRead(notification.id)
      const at = new Date().toISOString()
      setItems((current) =>
        (current ?? [])
          // Under "ยังไม่ได้อ่าน" the row has stopped belonging to the list it
          // is in, so it leaves rather than sitting there contradicting the tab.
          .filter((item) => !(unreadOnly && item.id === notification.id))
          .map((item) =>
            item.id === notification.id ? { ...item, readAt: at } : item
          )
      )
      setUnread((current) => Math.max(0, current - 1))
      // Under "ยังไม่ได้อ่าน" the row left the list, so the total it is
      // counted against has to come down with it — otherwise the line below
      // reads "แสดง 19 จาก 20" over a list that now holds all nineteen there
      // are. Under "ทั้งหมด" the row stayed, and so does the total.
      if (unreadOnly) {
        setMeta((current) =>
          current
            ? { ...current, total: Math.max(0, current.total - 1) }
            : current
        )
      }
      void queryClient.invalidateQueries({
        queryKey: unreadNotificationsQueryKey,
      })
    } catch {
      // The row stays unread and the page stays usable; pressing again retries
    }
  }

  const readAll = async () => {
    setBusy(true)
    try {
      await markAllNotificationsRead()
      // Everything on every page changed, so starting over is the honest read.
      reset()
    } catch {
      // as above
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-r4 bg-white px-5 py-4 shadow-sh1">
        <div className="flex items-center gap-1.5 rounded-full bg-n-100 p-1.5">
          <FilterChip
            active={!unreadOnly}
            onClick={() => setUnreadOnly(false)}
            label="ทั้งหมด"
          />
          <FilterChip
            active={unreadOnly}
            onClick={() => setUnreadOnly(true)}
            label="ยังไม่ได้อ่าน"
            count={unread}
          />
        </div>

        {unread > 0 ? (
          <Button variant="secondary" size="md" disabled={busy} onClick={readAll}>
            {busy ? "กำลังทำเครื่องหมาย…" : "อ่านแล้วทั้งหมด"}
          </Button>
        ) : (
          <span className="text-sm text-n-500">อ่านครบแล้ว</span>
        )}
      </div>

      {items.length === 0 ? (
        <p className="mt-4 rounded-r4 bg-white px-6 py-16 text-center text-n-500 shadow-sh1">
          {unreadOnly ? "อ่านครบทุกรายการแล้ว" : "ยังไม่มีการแจ้งเตือน"}
        </p>
      ) : (
        <ol className="mt-4 overflow-hidden rounded-r4 bg-white shadow-sh1">
          {items.map((notification) => {
            const Icon = ICON[notification.type]
            const href = destination(notification)
            const isNew = notification.readAt === null

            const body = (
              <div
                className={cn(
                  // The unread marker is a bar down the whole row rather than a
                  // dot at the end of it: at a glance it is the left edge that
                  // says which rows still need attention, without reading any
                  // of them.
                  "flex items-start gap-3 border-l-4 px-5 py-4",
                  isNew ? "border-amber-500 bg-amber-50/40" : "border-transparent"
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full",
                    TONE[notification.type]
                  )}
                >
                  <Icon className="size-4.5" />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <p
                      className={cn(
                        "text-sm",
                        isNew ? "font-bold text-ink" : "font-semibold text-n-600"
                      )}
                    >
                      {LABEL[notification.type]}
                    </p>
                    {/* The exact moment stays reachable on hover, for when the
                        rounded-off answer is not the one wanted. */}
                    <time
                      dateTime={notification.createdAt}
                      title={formatDateTime(notification.createdAt)}
                      className="shrink-0 text-xs text-n-500"
                    >
                      {timeAgo(notification.createdAt)}
                    </time>
                  </div>

                  <p
                    className={cn(
                      "mt-0.5 text-sm",
                      isNew ? "text-n-700" : "text-n-500"
                    )}
                  >
                    {shortenIds(notification.message)}
                  </p>
                </div>
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
                  // Nothing to open — see `destination`. Still markable as read,
                  // so the badge can be cleared.
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
      )}

      {/* A feed is read downwards and nobody jumps to page four of one, so it
          grows rather than paginating. Until this existed the list asked for
          thirty rows and stopped: notification thirty-one was unreachable, and
          every bid, order, shipment step and message writes one. */}
      {loadedPages < meta.totalPages && (
        <div className="mt-4 flex flex-col items-center gap-2">
          <Button
            variant="secondary"
            size="md"
            disabled={loadingMore}
            onClick={loadMore}
          >
            {loadingMore ? "กำลังโหลด…" : "โหลดเพิ่ม"}
            {!loadingMore && <ChevronDown />}
          </Button>
          <p className="text-xs text-n-500">
            แสดง {items.length.toLocaleString("th-TH")} จาก{" "}
            {meta.total.toLocaleString("th-TH")} รายการ
          </p>
        </div>
      )}
    </>
  )
}

function FilterChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  label: string
  count?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-all outline-none focus-visible:ring-3 focus-visible:ring-amber-500/30",
        active
          ? "bg-white text-ink shadow-sh1"
          : "text-n-500 hover:text-ink"
      )}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span
          className={cn(
            "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-bold tabular-nums",
            active ? "bg-amber-500 text-ink" : "bg-n-200 text-n-600"
          )}
        >
          {count.toLocaleString("th-TH")}
        </span>
      )}
    </button>
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
          <div className="size-9 shrink-0 rounded-full bg-n-100 motion-safe:animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-2/5 rounded-full bg-n-100 motion-safe:animate-pulse" />
            <div className="h-3 w-4/5 rounded-full bg-n-100 motion-safe:animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  )
}
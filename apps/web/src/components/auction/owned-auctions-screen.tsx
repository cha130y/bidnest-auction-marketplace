"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"

import { AuctionImage } from "@/components/auction/auction-image"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ApiError } from "@/lib/api/client"
import { cancelOwnAuction, listOwnAuctions } from "@/lib/api/seller-auctions"
import { categoryLabel } from "@/lib/category-labels"
import { formatDateTime, formatTHB } from "@/lib/format"
import { cn } from "@/lib/utils"
import type {
  OwnerAuction,
  OwnerAuctionStatus,
  Paginated,
} from "@/lib/api/types"

/**
 * What each state means to the seller looking at it, and how loud to say it.
 *
 * Shaped after `components/product/owned-products-screen.tsx`, so a seller
 * reads both halves of their shop the same way. CANCELLED is the muted one on
 * purpose: it is a record, not a thing to act on.
 */
const STATUS: Record<
  OwnerAuctionStatus,
  { label: string; variant: "new" | "sold" | "live" | "won" | "ending" }
> = {
  DRAFT: { label: "ร่าง", variant: "new" },
  SCHEDULED: { label: "ตั้งเวลาไว้", variant: "ending" },
  ACTIVE: { label: "กำลังประมูล", variant: "live" },
  SOLD: { label: "ขายแล้ว", variant: "won" },
  UNSOLD: { label: "ไม่มีผู้ชนะ", variant: "sold" },
  CANCELLED: { label: "ยกเลิกแล้ว", variant: "sold" },
}

/** The filter's options, in lifecycle order — the order a seller thinks in. */
const FILTER_OPTIONS: OwnerAuctionStatus[] = [
  "DRAFT",
  "SCHEDULED",
  "ACTIVE",
  "SOLD",
  "UNSOLD",
  "CANCELLED",
]

const ALL_STATUSES = "ALL"

/**
 * AUC-006 — a seller can only call off what nobody has bid on yet, and only
 * before it opens. The API is the one that enforces it
 * (`assertAuctionIsCancellable`); this decides whether to offer the button, so
 * the two have to agree — a button that always 400s is worse than no button.
 */
const isCancellable = (auction: OwnerAuction) =>
  (auction.status === "DRAFT" || auction.status === "SCHEDULED") &&
  auction.bidCount === 0

const PAGE_SIZE = 12

/**
 * AUC-006 — the seller's own auctions, in every state.
 *
 * Replaces the drafts-only list this screen used to be. A published auction
 * left that list and turned up nowhere else, so the only way to find one was
 * to go to `/auctions` and hunt for your own row — and a scheduled auction
 * could not be called off at all without knowing its URL.
 */
export function OwnedAuctionsList() {
  const [status, setStatus] = useState<OwnerAuctionStatus | typeof ALL_STATUSES>(
    ALL_STATUSES
  )
  const [page, setPage] = useState(1)

  /**
   * Bumped to ask for the list again without changing what is being asked for
   * — which is what a cancellation needs: same filter, same page, new answer.
   */
  const [reloadToken, setReloadToken] = useState(0)
  const reload = useCallback(() => setReloadToken((token) => token + 1), [])

  /**
   * One piece of state holding the answer *and* the question it answers.
   *
   * Kept together rather than as a `loading` flag beside the data, because a
   * flag has to be raised before the read starts — a `setState` in the body of
   * an effect, which React's own lint rule refuses and the compiler cannot
   * reason about. Comparing the loaded key against the current one says the
   * same thing without writing anything: if they differ, the read for what is
   * on screen now has not landed yet.
   *
   * It also keeps the previous page's rows visible while the next one loads,
   * and drops a stale error the moment the filter changes.
   */
  const [loaded, setLoaded] = useState<{
    key: string
    result: Paginated<OwnerAuction> | null
    error: unknown
  } | null>(null)

  const key = `${status}:${page}:${reloadToken}`

  useEffect(() => {
    let cancelled = false

    listOwnAuctions({
      status: status === ALL_STATUSES ? undefined : status,
      page,
      limit: PAGE_SIZE,
    })
      .then((fresh) => {
        if (!cancelled) setLoaded({ key, result: fresh, error: null })
      })
      .catch((caught: unknown) => {
        if (!cancelled) setLoaded({ key, result: null, error: caught })
      })

    // A filter changed while a read was in flight would otherwise let the
    // slower answer land last and show the wrong status under the new heading.
    return () => {
      cancelled = true
    }
  }, [key, status, page])

  const loading = loaded?.key !== key
  const result = loaded?.result ?? null
  // Only the current question's failure. An error from the filter before this
  // one describes a list nobody is looking at any more.
  const error = loaded?.key === key ? loaded.error : null

  const items = result?.items ?? []
  const meta = result?.meta

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-n-600">
          {meta
            ? `${meta.total.toLocaleString("th-TH")} รายการ`
            : "กำลังโหลด…"}
        </span>

        <div className="flex items-center gap-2">
          <label
            htmlFor="auction-status"
            className="text-xs font-bold tracking-[0.14em] text-n-500 uppercase"
          >
            สถานะ
          </label>
          <Select
            items={STATUS_ITEMS}
            value={status}
            onValueChange={(value) => {
              // A filter change starts at page 1: page 3 of "ร่าง" rarely
              // exists under "ขายแล้ว".
              setPage(1)
              setStatus(
                value === ALL_STATUSES
                  ? ALL_STATUSES
                  : (value as OwnerAuctionStatus)
              )
            }}
          >
            <SelectTrigger id="auction-status" className="h-11 w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_STATUSES}>ทุกสถานะ</SelectItem>
              {FILTER_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {STATUS[option].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error ? (
        <div className="rounded-r4 border border-red bg-red-50 px-6 py-8 text-center">
          <p className="font-semibold text-red">
            {error instanceof ApiError
              ? error.message
              : "โหลดรายการประมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"}
          </p>
        </div>
      ) : !result ? (
        <div
          className="h-64 rounded-r4 bg-white shadow-sh1 motion-safe:animate-pulse"
          aria-hidden="true"
        />
      ) : items.length === 0 ? (
        <EmptyState filtered={status !== ALL_STATUSES} />
      ) : (
        <>
          {/* Dimmed rather than replaced while the next page or filter loads:
              the rows that are there are still true, and swapping them for a
              placeholder makes the page jump for no gain. */}
          <ul
            aria-busy={loading}
            className={cn(
              "grid gap-5 transition-opacity sm:grid-cols-2 xl:grid-cols-3",
              loading && "opacity-60"
            )}
          >
            {items.map((auction) => (
              <li key={auction.id}>
                <AuctionRow auction={auction} onChanged={reload} />
              </li>
            ))}
          </ul>

          {meta && meta.totalPages > 1 && (
            <nav
              aria-label="หน้ารายการประมูล"
              className="flex items-center justify-center gap-3"
            >
              <Button
                variant="secondary"
                size="md"
                disabled={meta.page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                ก่อนหน้า
              </Button>
              <span className="text-sm text-n-600">
                หน้า {meta.page} จาก {meta.totalPages}
              </span>
              <Button
                variant="secondary"
                size="md"
                disabled={meta.page >= meta.totalPages}
                onClick={() =>
                  setPage((current) =>
                    Math.min(meta.totalPages, current + 1)
                  )
                }
              >
                ถัดไป
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  )
}

/** `Select` wants the whole set up front for its own labelling. */
const STATUS_ITEMS: Record<string, string> = {
  [ALL_STATUSES]: "ทุกสถานะ",
  ...Object.fromEntries(
    FILTER_OPTIONS.map((option) => [option, STATUS[option].label])
  ),
}

/**
 * One auction, and whatever can still be done with it.
 *
 * A draft goes to its workbench (`/sell/[id]`, where it is finished and
 * published); anything published goes to the auction itself, because that is
 * where its bidding, its countdown and its result already live — a second
 * seller-only view of a running auction would be one more screen to keep in
 * step with the room.
 */
function AuctionRow({
  auction,
  onChanged,
}: {
  auction: OwnerAuction
  onChanged: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const status = STATUS[auction.status]
  const isDraft = auction.status === "DRAFT"
  const href = isDraft ? `/sell/${auction.id}` : `/auctions/${auction.id}`
  const hasBids = auction.bidCount > 0

  const cancel = async () => {
    setError(null)
    setCancelling(true)

    try {
      // AUC-006 — a seller's reason is optional, unlike an admin's (ADM-001),
      // so nothing is invented on their behalf here.
      await cancelOwnAuction(auction.id, "")
      onChanged()
    } catch (caught: unknown) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "ยกเลิกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"
      )
    } finally {
      setCancelling(false)
    }
  }

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-r4 bg-white shadow-sh1">
      <Link href={href} className="block">
        <AuctionImage
          src={auction.images.find((image) => image.isPrimary)?.url}
          alt=""
          className="aspect-4/3 w-full"
        />
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs font-bold tracking-[0.12em] text-amber-600 uppercase">
            {categoryLabel(auction.category)}
          </span>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>

        <Link
          href={href}
          className="mt-1 font-display text-base font-bold text-ink hover:text-amber-600"
        >
          <span className="line-clamp-2">{auction.title}</span>
        </Link>

        <div className="mt-3 border-t border-n-200 pt-3">
          <span className="text-[10px] font-bold tracking-[0.14em] text-n-500 uppercase">
            {hasBids ? "ราคาปัจจุบัน" : "ราคาเริ่มต้น"}
          </span>
          <p className="font-display text-lg font-extrabold text-ink tabular-nums">
            {formatTHB(hasBids ? auction.currentPrice : auction.startingPrice)}
          </p>
          <p className="mt-1 text-xs text-n-500">
            แก้ไขล่าสุด {formatDateTime(auction.updatedAt)}
            {isDraft && auction.images.length === 0 && " · ยังไม่มีรูป"}
            {isDraft && !auction.scheduledStartAt && " · ยังไม่กำหนดเวลา"}
            {!isDraft &&
              auction.bidCount > 0 &&
              ` · เสนอราคาแล้ว ${auction.bidCount.toLocaleString("th-TH")} ครั้ง`}
          </p>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <Button
            variant="primary"
            size="md"
            nativeButton={false}
            render={<Link href={href} />}
          >
            {isDraft ? "ทำร่างต่อ" : "ดูการประมูล"}
          </Button>

          {/**
           * Two steps, because a cancellation is one way: AUC-006 moves the
           * auction to CANCELLED and there is no route back, whereas a draft
           * left alone costs nothing. The confirmation says what is about to
           * be lost rather than asking "are you sure" of nothing in
           * particular.
           */}
          {isCancellable(auction) &&
            (confirming ? (
              <div className="rounded-r3 bg-red-50 p-3 ring-1 ring-red/30">
                <p className="text-xs font-semibold text-red">
                  ยกเลิกแล้วกู้คืนไม่ได้ และรายการนี้จะไม่เปิดประมูลอีก
                </p>
                <div className="mt-2 flex gap-2">
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={cancelling}
                    onClick={cancel}
                  >
                    {cancelling ? "กำลังยกเลิก…" : "ยืนยันยกเลิก"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={cancelling}
                    onClick={() => setConfirming(false)}
                  >
                    ไม่ใช่ตอนนี้
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="danger"
                size="md"
                onClick={() => setConfirming(true)}
              >
                {auction.status === "DRAFT"
                  ? "ยกเลิกร่างนี้"
                  : "ยกเลิกการประมูลที่ตั้งเวลาไว้"}
              </Button>
            ))}
        </div>

        {error && (
          <p role="alert" className="mt-2 text-xs font-semibold text-red">
            {error}
          </p>
        )}
      </div>
    </article>
  )
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="rounded-r4 bg-white px-6 py-16 text-center shadow-sh1">
      <p className="text-n-500">
        {filtered
          ? "ไม่มีรายการในสถานะนี้"
          : "ยังไม่มีการประมูลที่สร้างไว้"}
      </p>
      {!filtered && (
        <Button
          variant="primary"
          size="lg"
          className="mt-4"
          nativeButton={false}
          render={<Link href="/sell" />}
        >
          สร้างการประมูลรายการแรก
        </Button>
      )}
    </div>
  )
}

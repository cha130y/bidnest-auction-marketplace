"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api/client"
import { listOwnDrafts } from "@/lib/api/seller-auctions"
import { formatDateTime, formatTHB } from "@/lib/format"
import type { OwnerAuction } from "@/lib/api/types"

/**
 * AUC-001 — the seller's own drafts, the ones no buyer can see.
 *
 * Published auctions are not here: once a draft goes live it is on
 * `/auctions` like everything else, and its own page is where its bidding is.
 * This list is the workbench, not the shop.
 */
export function OwnedDraftsList() {
  const [drafts, setDrafts] = useState<OwnerAuction[] | null>(null)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    let cancelled = false

    listOwnDrafts()
      .then((result) => {
        if (!cancelled) setDrafts(result.items)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught)
      })

    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return (
      <div className="rounded-r4 border border-red bg-red-50 px-6 py-8 text-center">
        <p className="font-semibold text-red">
          {error instanceof ApiError
            ? error.message
            : "โหลดรายการร่างไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"}
        </p>
      </div>
    )
  }

  if (!drafts) {
    return (
      <div
        className="h-40 rounded-r4 bg-white shadow-sh1 motion-safe:animate-pulse"
        aria-hidden="true"
      />
    )
  }

  if (drafts.length === 0) {
    return (
      <div className="rounded-r4 bg-white px-6 py-16 text-center shadow-sh1">
        <p className="text-n-500">ยังไม่มีร่างการประมูล</p>
        <Button
          variant="primary"
          size="lg"
          className="mt-4"
          nativeButton={false}
          render={<Link href="/sell" />}
        >
          สร้างรายการประมูล
        </Button>
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {drafts.map((draft) => (
        <li key={draft.id}>
          <Link
            href={`/sell/${draft.id}`}
            className="flex flex-wrap items-center justify-between gap-4 rounded-r4 bg-white px-5 py-4 shadow-sh1 transition-shadow hover:shadow-sh2"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Badge variant="new">ร่าง</Badge>
                <span className="truncate font-display text-base font-semibold text-ink">
                  {draft.title}
                </span>
              </div>
              <p className="mt-1 text-xs text-n-500">
                แก้ไขล่าสุด {formatDateTime(draft.updatedAt)}
                {draft.images.length === 0 && " · ยังไม่มีรูป"}
                {!draft.scheduledStartAt && " · ยังไม่กำหนดเวลา"}
              </p>
            </div>

            <div className="text-right">
              <span className="block text-xs text-n-500">ราคาเริ่มต้น</span>
              <span className="font-display text-base font-bold text-ink">
                {formatTHB(draft.startingPrice)}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}

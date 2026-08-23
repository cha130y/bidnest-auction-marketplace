"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { DraftForm } from "@/components/auction/draft-form"
import { ApiError } from "@/lib/api/client"
import { listCategories } from "@/lib/api/categories"
import { getOwnDraft, updateAuction } from "@/lib/api/seller-auctions"
import type { CategoryTree, OwnerAuction } from "@/lib/api/types"

/**
 * AUC-006 — editing.
 *
 * Nothing here decides what may still change: the API refuses an edit the
 * status no longer allows, and its message is what the seller reads. A form
 * that greyed fields out on its own would be a second copy of that rule, and
 * the two would disagree the day one of them changed.
 */
export function EditDraftScreen({ auctionId }: { auctionId: string }) {
  const router = useRouter()
  const [draft, setDraft] = useState<OwnerAuction | null>(null)
  const [categories, setCategories] = useState<CategoryTree[] | null>(null)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    let cancelled = false

    Promise.all([getOwnDraft(auctionId), listCategories()])
      .then(([next, list]) => {
        if (cancelled) return
        setDraft(next)
        setCategories(list)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught)
      })

    return () => {
      cancelled = true
    }
  }, [auctionId])

  if (error) {
    return (
      <div className="rounded-r4 border border-red bg-red-50 px-6 py-8 text-center">
        <p className="font-semibold text-red">
          {error instanceof ApiError
            ? error.message
            : "โหลดร่างไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"}
        </p>
      </div>
    )
  }

  if (!draft || !categories) {
    return (
      <div
        className="h-96 rounded-r4 bg-white shadow-sh1 motion-safe:animate-pulse"
        aria-hidden="true"
      />
    )
  }

  return (
    <div className="rounded-r4 bg-white p-6 shadow-sh1">
      <DraftForm
        categories={categories}
        initial={draft}
        submitLabel="บันทึกการแก้ไข"
        onSubmit={async (input) => {
          await updateAuction(draft.id, input)
          router.push(`/sell/${draft.id}`)
        }}
      />
    </div>
  )
}

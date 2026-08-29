"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { DraftForm } from "@/components/auction/draft-form"
import { SellerShell } from "@/components/auction/seller-shell"
import { listCategories } from "@/lib/api/categories"
import { createDraft } from "@/lib/api/seller-auctions"
import type { CategoryTree } from "@/lib/api/types"

/**
 * AUC-001 — starts a draft and goes to its page, where AUC-002 says what is
 * still missing before it can go live.
 *
 * Creating and completing are deliberately two steps. A draft exists to be
 * saved half-finished; making the form demand everything up front would mean
 * a seller with an unfinished listing has nowhere to put it.
 */
export function CreateDraftScreen() {
  return (
    <SellerShell>
      <Form />
    </SellerShell>
  )
}

function Form() {
  const router = useRouter()
  const [categories, setCategories] = useState<CategoryTree[] | null>(null)

  useEffect(() => {
    let cancelled = false

    listCategories()
      .then((result) => {
        if (!cancelled) setCategories(result)
      })
      .catch(() => {
        // An empty list still renders the form; the select simply has nothing
        // to offer, and the API refuses a draft without a category anyway.
        if (!cancelled) setCategories([])
      })

    return () => {
      cancelled = true
    }
  }, [])

  if (!categories) {
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
        submitLabel="บันทึกร่าง"
        onSubmit={async (input) => {
          const draft = await createDraft(input)
          router.push(`/sell/${draft.id}`)
        }}
      />
    </div>
  )
}

"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AlertTriangle, Check } from "lucide-react"

import { AuctionImage } from "@/components/auction/auction-image"
import { DraftImageManager } from "@/components/auction/draft-image-manager"
import { PriceSuggestionButton } from "@/components/auction/price-suggestion-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api/client"
import { categoryLabel } from "@/lib/category-labels"
import { formatDateTime, formatTHB } from "@/lib/format"
import {
  cancelOwnAuction,
  getOwnDraft,
  publishDraft,
  updateAuction,
  validateDraft,
} from "@/lib/api/seller-auctions"
import type { DraftValidation, OwnerAuction } from "@/lib/api/types"

/**
 * AUC-002 / AUC-004 / AUC-006 — one draft, what is stopping it, and the two
 * things a seller can do about it.
 *
 * Readiness is asked for, never worked out here. The gate that answers
 * `/validation` is the same one that refuses a publish, so this cannot offer
 * a publish the API would reject or grey out one it would accept. The publish
 * button is disabled from `ready`, and the reasons come back already written.
 */
export function DraftDetail({ auctionId }: { auctionId: string }) {
  const router = useRouter()
  const [draft, setDraft] = useState<OwnerAuction | null>(null)
  const [validation, setValidation] = useState<DraftValidation | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  /**
   * Both together, because the page is only coherent with both: a checklist
   * beside a draft it does not describe is worse than a slower page.
   */
  const load = useCallback(
    () =>
      Promise.all([getOwnDraft(auctionId), validateDraft(auctionId)])
        .then(([next, check]) => {
          setDraft(next)
          setValidation(check)
          setError(null)
        })
        .catch((caught: unknown) => setError(caught)),
    [auctionId]
  )

  useEffect(() => {
    // The state is set from the promise callback rather than in this body,
    // which is what the set-state-in-effect rule is asking for.
    void load()
  }, [load])

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

  if (!draft || !validation) {
    return (
      <div
        className="h-96 rounded-r4 bg-white shadow-sh1 motion-safe:animate-pulse"
        aria-hidden="true"
      />
    )
  }

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setActionError(null)
    try {
      await action()
    } catch (caught) {
      setActionError(
        caught instanceof ApiError
          ? caught.message
          : "ทำรายการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"
      )
    } finally {
      setBusy(false)
    }
  }

  const primaryImage =
    draft.images.find((image) => image.isPrimary) ?? draft.images[0]

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-4">
        <section className="rounded-r4 bg-white p-6 shadow-sh1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="new">ร่าง</Badge>
            <span className="text-xs text-n-500">
              แก้ไขล่าสุด {formatDateTime(draft.updatedAt)}
            </span>
          </div>

          <h2 className="mt-2 font-display text-xl font-bold text-ink">
            {draft.title}
          </h2>
          <p className="mt-1 text-sm text-n-500">
            {categoryLabel(draft.category)} ·{" "}
            {draft.condition === "NEW" ? "ของใหม่" : "มือสอง"}
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-[160px_1fr]">
            <AuctionImage
              src={primaryImage?.url}
              alt={draft.title}
              className="aspect-square w-full rounded-r3"
            />
            <dl className="grid gap-2 text-sm">
              <Row label="ราคาเริ่มต้น" value={formatTHB(draft.startingPrice)} />
              <Row
                label="เพิ่มขั้นต่ำครั้งละ"
                value={formatTHB(draft.minBidIncrement)}
              />
              {/* AUC-003 — the seller's own screen is the one place the number
                  itself belongs, because this is who it belongs to. */}
              <Row
                label="ราคาขั้นต่ำที่ยอมขาย"
                value={
                  draft.reservePrice
                    ? formatTHB(draft.reservePrice)
                    : "ไม่ได้ตั้งไว้"
                }
              />
              <Row
                label="เวลาเริ่ม"
                value={
                  draft.scheduledStartAt
                    ? formatDateTime(draft.scheduledStartAt)
                    : "ยังไม่กำหนด"
                }
              />
              <Row
                label="เวลาปิด"
                value={
                  draft.originalEndAt
                    ? formatDateTime(draft.originalEndAt)
                    : "ยังไม่กำหนด"
                }
              />
              <Row label="รูปภาพ" value={`${draft.images.length} รูป`} />
            </dl>
          </div>

          <p className="mt-4 text-sm leading-6 whitespace-pre-line text-n-600">
            {draft.description}
          </p>

          {/* AI-002 — needs at least one uploaded photo, same gate the API
              enforces; hidden rather than shown-then-erroring since the image
              count is already known here. */}
          {draft.images.length > 0 && (
            <div className="mt-4 border-t border-n-200 pt-4">
              <PriceSuggestionButton
                auctionId={draft.id}
                onApply={(estimate) =>
                  void run(async () => {
                    await updateAuction(draft.id, {
                      startingPrice: estimate.suggestedStartingPrice,
                    })
                    await load()
                  })
                }
              />
            </div>
          )}
        </section>

        <section className="rounded-r4 bg-white p-6 shadow-sh1">
          {/* Adding or removing a picture can change whether the draft is
              publishable (AUC-002 requires at least one), so this reloads
              both rather than only patching the images it just changed. */}
          <DraftImageManager
            auctionId={draft.id}
            images={draft.images}
            onChange={() => void load()}
          />
        </section>
      </div>

      <aside className="flex flex-col gap-4">
        <section className="rounded-r4 bg-white p-5 shadow-sh1">
          <h3 className="font-display text-base font-bold text-ink">
            ก่อนเผยแพร่
          </h3>

          {validation.ready ? (
            <p className="mt-3 flex items-start gap-2 rounded-r2 bg-green-50 px-3 py-2 text-sm font-medium text-green">
              <Check className="mt-0.5 size-4 shrink-0" />
              ครบทุกอย่างแล้ว พร้อมเผยแพร่
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {validation.issues.map((issue) => (
                // The message is written by the API and is already readable, so
                // nothing here composes copy from `code` — a rule added later
                // shows up correctly without this file knowing about it.
                <li
                  key={issue.code}
                  className="flex items-start gap-2 rounded-r2 bg-amber-50 px-3 py-2 text-sm text-ink"
                >
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                  {issue.message}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex flex-col gap-2">
            <Button
              variant="primary"
              size="lg"
              block
              disabled={!validation.ready || busy}
              onClick={() =>
                void run(async () => {
                  const published = await publishDraft(draft.id)
                  router.push(`/auctions/${published.id}`)
                })
              }
            >
              {busy ? "กำลังดำเนินการ…" : "เผยแพร่"}
            </Button>

            <Button
              variant="secondary"
              size="md"
              block
              nativeButton={false}
              render={<Link href={`/sell/${draft.id}/edit`} />}
            >
              แก้ไขร่าง
            </Button>

            <Button
              variant="secondary"
              size="md"
              block
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await cancelOwnAuction(draft.id, "ยกเลิกโดยผู้ขาย")
                  router.push("/sell/auctions")
                })
              }
            >
              ยกเลิกร่างนี้
            </Button>
          </div>

          {actionError && (
            <p role="alert" className="mt-3 text-sm font-medium text-red">
              {actionError}
            </p>
          )}
        </section>

        {/* AUC-004 — the preview is the same draft read through the public
            mapper, so following this link is the honest way to see what a
            buyer will get, reserve and all left out. */}
        <p className="rounded-r4 bg-white px-5 py-4 text-sm text-n-600 shadow-sh1">
          หลังเผยแพร่ ผู้ซื้อจะเห็นทุกอย่างข้างต้น{" "}
          <span className="font-semibold text-ink">
            ยกเว้นราคาขั้นต่ำที่ยอมขาย
          </span>{" "}
          ซึ่งจะแสดงเพียงว่าถึงแล้วหรือยัง
        </p>
      </aside>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-n-500">{label}</dt>
      <dd className="text-right font-medium text-ink">{value}</dd>
    </div>
  )
}

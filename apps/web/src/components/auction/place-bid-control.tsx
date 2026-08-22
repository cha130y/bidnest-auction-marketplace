"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { placeBid } from "@/lib/api/auctions"
import { ApiError } from "@/lib/api/client"
import { loginHref } from "@/lib/api/auth/login-redirect"
import { formatTHB } from "@/lib/format"
import { cn } from "@/lib/utils"
import type {
  ArenaParticipation,
  Auction,
  BidBlockedReason,
} from "@/lib/api/types"

/** The API decides who may bid; this only says it in Thai. */
const BLOCKED_MESSAGE: Record<BidBlockedReason, string> = {
  AUCTION_NOT_OPEN: "การประมูลนี้ยังไม่เปิดให้เสนอราคา",
  YOU_ARE_THE_SELLER: "คุณเป็นผู้ขายรายการนี้ จึงเสนอราคาไม่ได้",
  ADMINS_DO_NOT_BID: "บัญชีผู้ดูแลระบบไม่สามารถเสนอราคาได้",
}

/**
 * BID-001 / BID-002 — the bid control.
 *
 * Whether it is usable is `you.canBid`, straight from the API, and the reason
 * it is not is `you.blockedBy`. Neither is worked out here: the rules about
 * sellers and admins live in one place on the server, and a second copy on
 * screen would be a second thing to keep in step.
 *
 * `you` is null for anybody not signed in — a different thing from being
 * signed in and not allowed — so that case gets the sign-in link rather than a
 * refusal.
 *
 * Nobody can be signed in yet: the login screen is Dev 1's NextAuth work and
 * has not shipped, so `loginHref()` currently lands on a 404. That is the same
 * placeholder Dev 3's add-to-cart button uses, and the destination is already
 * agreed — this control is finished apart from having somewhere to send people.
 */
export function PlaceBidControl({
  auction,
  you,
  className,
  onBidPlaced,
}: {
  auction: Auction
  you: ArenaParticipation | null
  className?: string
  onBidPlaced?: () => void
}) {
  const router = useRouter()
  const [amount, setAmount] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  /**
   * BID-002 — the same attempt keeps the same id.
   *
   * A dropped connection leaves the browser unable to tell "the bid never
   * arrived" from "the bid was accepted and the reply was lost". Reusing the
   * id means pressing the button again replays the first bid instead of
   * placing a second one; the API answers a repeat with the original bid.
   *
   * Cleared only once a bid is actually accepted, so the next one is a new
   * attempt rather than a replay of the last.
   */
  const attemptId = useRef<string | null>(null)

  if (!you) {
    return (
      <div className={className}>
        <Button
          variant="primary"
          size="lg"
          block
          // `loginHref()` reads `window.location` to build the callback, so it
          // runs on click rather than during render — calling it in the body
          // threw `window is not defined` while this was server-rendered.
          // Same reason Dev 3's add-to-cart button calls it from its handler.
          onClick={() => router.push(loginHref())}
        >
          เข้าสู่ระบบเพื่อเสนอราคา
        </Button>
      </div>
    )
  }

  if (!you.canBid) {
    return (
      <p
        className={cn(
          "rounded-r2 bg-n-100 px-4 py-3 text-center text-sm text-n-600",
          className
        )}
      >
        {you.blockedBy
          ? BLOCKED_MESSAGE[you.blockedBy]
          : "ตอนนี้เสนอราคาไม่ได้"}
      </p>
    )
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0) {
      setError("กรอกจำนวนเงินให้ถูกต้อง")
      return
    }

    // Checked here only to save a round trip on an obvious mistake. The API
    // rejects it too, and its answer is the one that counts.
    if (value < Number(auction.minimumNextBid)) {
      setError(`ต้องเสนออย่างน้อย ${formatTHB(auction.minimumNextBid)}`)
      return
    }

    attemptId.current ??= crypto.randomUUID()
    setSubmitting(true)

    try {
      await placeBid(auction.id, {
        amount: value,
        clientRequestId: attemptId.current,
      })
      attemptId.current = null
      setAmount("")
      onBidPlaced?.()
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "ส่งการเสนอราคาไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className={className}>
      <label
        htmlFor="bid-amount"
        className="block text-sm font-medium text-ink"
      >
        เสนอราคาอย่างน้อย {formatTHB(auction.minimumNextBid)}
      </label>

      <div className="mt-2 flex gap-2">
        <Input
          id="bid-amount"
          type="number"
          inputMode="decimal"
          step="0.01"
          min={auction.minimumNextBid}
          placeholder={auction.minimumNextBid}
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          disabled={submitting}
          className="flex-1"
        />
        <Button type="submit" variant="primary" size="lg" disabled={submitting}>
          {submitting ? "กำลังส่ง…" : "เสนอราคา"}
        </Button>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-red">
          {error}
        </p>
      )}
    </form>
  )
}

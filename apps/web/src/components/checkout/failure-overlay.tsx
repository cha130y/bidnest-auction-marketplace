"use client"

import Link from "next/link"
import { AlertTriangle, PackageX, ReceiptText, XCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api/client"
import type { CheckoutErrorCode, CheckoutIssue } from "@/lib/api/types"

/**
 * CART-004 — a refused checkout, sorted into the answer the buyer needs.
 *
 * There used to be one screen for all of them, titled "ชำระเงินไม่สำเร็จ", with
 * "ลองใหม่อีกครั้ง" as its main button and a note promising that nothing had
 * been charged. For the common case — somebody else bought the last one first
 * — every part of that was wrong: it is not a payment problem, retrying can
 * never succeed, and in the race below money really had moved.
 */
export type CheckoutFailure = {
  kind: "UNAVAILABLE" | "RACE_LOST" | "DECLINED" | "AUCTION_PAID" | "UNKNOWN"
  title: string
  /** Said under the title. Null when the issue list says it better. */
  detail: string | null
  issues: CheckoutIssue[]
  /**
   * Whether a charge is on record with no order against it. Read from the
   * code, never guessed: `checkoutSessionId` comes back on a declined payment
   * too, where nothing was taken.
   */
  charged: boolean
  checkoutSessionId: string | null
  /** Whether pressing the same button again could plausibly work. */
  canRetry: boolean
  /** Where the buyer can actually fix this, when it is not here. */
  primary: { label: string; href: string } | null
}

type ErrorBody = {
  code?: CheckoutErrorCode
  reason?: string
  checkoutSessionId?: string
  issues?: CheckoutIssue[]
}

function bodyOf(error: unknown): ErrorBody {
  if (!(error instanceof ApiError)) return {}
  const body = error.body
  return typeof body === "object" && body !== null ? (body as ErrorBody) : {}
}

const BACK_TO_CART = { label: "กลับไปที่ตะกร้า", href: "/cart" }

/** What the API says is wrong with a line, said the way a buyer would say it. */
export function issueText(issue: CheckoutIssue): string {
  switch (issue.code) {
    case "PRODUCT_UNAVAILABLE":
      return "ผู้ขายปิดการขายสินค้านี้แล้ว"
    case "INSUFFICIENT_STOCK":
      // `available` is null in the race below — nothing truthful can be said
      // about the count from inside a transaction that is rolling back.
      return issue.available === null
        ? "มีคนซื้อไปก่อนระหว่างที่กำลังชำระเงิน"
        : `ของเหลือไม่พอ — เหลืออยู่ ${issue.available} ชิ้น`
    case "OWN_LISTING":
      return "สินค้านี้เป็นประกาศของคุณเอง ซื้อเองไม่ได้"
    case "NOT_IN_CART":
      return "รายการนี้ไม่อยู่ในตะกร้าแล้ว"
    default:
      return issue.message
  }
}

export function checkoutFailure(error: unknown): CheckoutFailure {
  const body = bodyOf(error)
  const issues = body.issues ?? []
  const sessionId = body.checkoutSessionId ?? null

  const base = {
    issues,
    charged: false,
    checkoutSessionId: sessionId,
    canRetry: false,
    primary: null,
  }

  switch (body.code) {
    case "ITEMS_UNAVAILABLE":
    case "CART_EMPTY":
      return {
        ...base,
        kind: "UNAVAILABLE",
        // Named as what it is rather than as a payment failure, because it is
        // not one: the request never reached the payment provider.
        title: issues.some((issue) => issue.code === "INSUFFICIENT_STOCK")
          ? "สินค้าหมดแล้ว"
          : "สั่งซื้อรายการนี้ไม่ได้แล้ว",
        detail:
          issues.length > 0
            ? null
            : "ตะกร้าของคุณไม่มีรายการที่ชำระเงินได้ในตอนนี้",
        primary: BACK_TO_CART,
      }

    case "STOCK_LOST_AFTER_CHARGE":
      return {
        ...base,
        kind: "RACE_LOST",
        title: "มีคนซื้อไปก่อนระหว่างที่กำลังชำระเงิน",
        detail:
          "ของชิ้นสุดท้ายถูกซื้อไปในจังหวะเดียวกับที่ระบบกำลังตัดเงินของคุณ",
        charged: true,
        primary: BACK_TO_CART,
      }

    case "AUCTION_ALREADY_PAID":
      return {
        ...base,
        kind: "AUCTION_PAID",
        title: "รายการนี้ชำระเงินไปแล้ว",
        detail:
          "ล็อตนี้มีคำสั่งซื้ออยู่แล้ว ไม่ต้องชำระซ้ำ — ดูได้ที่คำสั่งซื้อของคุณ",
        primary: { label: "ดูคำสั่งซื้อของฉัน", href: "/orders" },
      }

    case "AUCTION_UNPAYABLE":
      return {
        ...base,
        kind: "UNAVAILABLE",
        title: "ไม่มีรายการที่ต้องชำระเงิน",
        detail:
          "รายการนี้อาจยังไม่จบ ไม่ได้จบด้วยการขาย หรือไม่ใช่รายการที่คุณชนะ",
        primary: { label: "กลับไปหน้าประมูล", href: "/auctions" },
      }

    case "PAYMENT_DECLINED":
      return {
        ...base,
        kind: "DECLINED",
        title: "ชำระเงินไม่สำเร็จ",
        detail: body.reason
          ? `เหตุผลจากระบบชำระเงิน: ${body.reason}`
          : "ระบบชำระเงินปฏิเสธรายการนี้",
        // The one refusal a plain retry can get past.
        canRetry: true,
      }

    default:
      // A network drop, a 500, a validation error — anything the API did not
      // label. Retry is offered because nothing rules it out, and the API's own
      // message is shown because a guess would be worse than the truth in
      // whatever language it arrives in.
      return {
        ...base,
        kind: "UNKNOWN",
        title: "ชำระเงินไม่สำเร็จ",
        detail:
          error instanceof ApiError
            ? error.message
            : "เกิดข้อผิดพลาดระหว่างชำระเงิน",
        canRetry: true,
      }
  }
}

const ICONS = {
  UNAVAILABLE: PackageX,
  RACE_LOST: AlertTriangle,
  AUCTION_PAID: ReceiptText,
  DECLINED: XCircle,
  UNKNOWN: XCircle,
} as const

export function FailureOverlay({
  error,
  context,
  onRetry,
}: {
  error: unknown
  /**
   * What was being paid for. Only two things depend on it — whether there is a
   * cart to promise is still intact, and where the last-resort button goes —
   * but both would be wrong for a winner, who never had a cart.
   */
  context: "CART" | "AUCTION"
  onRetry: () => void
}) {
  const failure = checkoutFailure(error)
  const Icon = ICONS[failure.kind]
  const fallback =
    context === "CART"
      ? BACK_TO_CART
      : { label: "กลับไปหน้าประมูล", href: "/auctions" }

  return (
    <div
      role="alertdialog"
      aria-labelledby="checkout-failed-title"
      className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4 backdrop-blur-sm"
    >
      <div className="max-h-full w-full max-w-110 overflow-y-auto rounded-r4 bg-white px-6 py-8 text-center shadow-sh2">
        <Icon
          className={
            failure.kind === "DECLINED" || failure.kind === "UNKNOWN"
              ? "mx-auto size-10 text-red"
              : "mx-auto size-10 text-amber-500"
          }
          aria-hidden="true"
        />
        <h2
          id="checkout-failed-title"
          className="mt-4 font-display text-xl font-extrabold text-ink"
        >
          {failure.title}
        </h2>

        {failure.detail && (
          <p className="mt-2 text-sm text-n-600">{failure.detail}</p>
        )}

        {/* Which items, and what is wrong with each — the part that tells the
            buyer what to go and fix. */}
        {failure.issues.length > 0 && (
          <ul className="mt-4 space-y-2 text-left">
            {failure.issues.map((issue, index) => (
              <li
                key={issue.productId ?? index}
                className="rounded-r3 border border-n-200 px-3 py-2"
              >
                {issue.title && (
                  <span className="block line-clamp-2 text-sm font-semibold text-ink">
                    {issue.title}
                  </span>
                )}
                <span className="block text-xs text-n-600">
                  {issueText(issue)}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* The two of these are mutually exclusive and one of them always
            shows: whether money moved is the single thing a refused buyer
            most needs to be told, and the old screen answered it wrongly. */}
        {failure.charged ? (
          <div className="mt-4 rounded-r3 bg-amber-50 px-3 py-2 text-left text-xs text-ink">
            <p className="flex items-start gap-2">
              <AlertTriangle
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              <span>
                ระบบบันทึกรายการชำระเงินไว้แล้วแต่ไม่มีคำสั่งซื้อเกิดขึ้น
                กรุณาติดต่อทีมงานพร้อมรหัสรายการด้านล่าง
              </span>
            </p>
            {failure.checkoutSessionId && (
              <p className="mt-2 border-t border-amber-200 pt-2">
                <span className="text-n-600">รหัสรายการ</span>{" "}
                <span className="font-mono break-all text-ink">
                  {failure.checkoutSessionId}
                </span>
              </p>
            )}
          </div>
        ) : (
          <p className="mt-4 flex items-start gap-2 rounded-r3 bg-n-100 px-3 py-2 text-left text-xs text-n-600">
            <AlertTriangle
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <span>
              ยังไม่มีการตัดเงินและยังไม่มีคำสั่งซื้อเกิดขึ้น
              {/* Only where there is a cart to reassure them about — a winner
                  paying for a lot never had one. */}
              {context === "CART" && " สินค้าในตะกร้าของคุณยังอยู่ครบ"}
            </span>
          </p>
        )}

        <div className="mt-6 flex flex-col gap-2">
          {/* Offered only where it can work. On an out-of-stock refusal the
              same request is refused the same way every time, and a primary
              button that always fails is worse than no button. */}
          {failure.canRetry && (
            <Button variant="primary" size="lg" block onClick={onRetry}>
              ลองใหม่อีกครั้ง
            </Button>
          )}

          {/* Where the buyer can actually fix this. Promoted to the main
              button whenever retrying is not on offer, so every one of these
              screens leads somewhere. */}
          <Button
            variant={failure.canRetry ? "ghost" : "primary"}
            size={failure.canRetry ? "sm" : "lg"}
            block
            nativeButton={false}
            render={<Link href={(failure.primary ?? fallback).href} />}
          >
            {(failure.primary ?? fallback).label}
          </Button>
        </div>
      </div>
    </div>
  )
}

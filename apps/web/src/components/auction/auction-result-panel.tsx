import { Badge } from "@/components/ui/badge"
import { formatDateTime, formatTHB } from "@/lib/format"
import type { AuctionResult } from "@/lib/api/types"

/**
 * LIV-004 — how it ended, once it has.
 *
 * The three numbers are deliberately not interchangeable, and the panel keeps
 * them apart:
 *
 * - `soldPrice` is what somebody actually paid. Null unless it sold.
 * - `finalPrice` is the highest bid it reached, sold or not — which is what
 *   "ราคาสุดท้าย" means for an auction that did not sell. Null when nobody bid,
 *   because a price of 0 there means "no price", not "it went for nothing".
 * - `reserveMet` is the whole of what a buyer is told about the reserve
 *   (AUC-003). The amount itself never leaves the API.
 *
 * An UNSOLD auction names no winner. The top bidder did not win it, and
 * showing them as though they had would be a lie on screen.
 */
export function AuctionResultPanel({ result }: { result: AuctionResult }) {
  const sold = result.outcome === "SOLD"

  return (
    <section className="rounded-r4 bg-white p-5 shadow-sh1">
      <div className="flex items-center justify-between gap-3">
        <Badge variant={sold ? "won" : "sold"}>
          {sold ? "ขายแล้ว" : "ไม่มีผู้ชนะ"}
        </Badge>
        {result.endedAt && (
          <span className="text-xs text-n-500">
            จบเมื่อ {formatDateTime(result.endedAt)}
          </span>
        )}
      </div>

      <div className="mt-4">
        <span className="text-xs text-n-500">
          {sold ? "ราคาปิด" : "ราคาสูงสุดที่ไปถึง"}
        </span>
        <div className="font-display text-3xl font-extrabold text-ink">
          {sold
            ? formatTHB(result.soldPrice ?? "0")
            : result.finalPrice
              ? formatTHB(result.finalPrice)
              : "ไม่มีผู้เสนอราคา"}
        </div>
      </div>

      <dl className="mt-4 grid gap-2 border-t border-n-200 pt-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-n-500">จำนวนการเสนอราคา</dt>
          <dd className="font-medium text-ink">
            {result.bidCount.toLocaleString("th-TH")} ครั้ง
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-n-500">ถึงราคาขั้นต่ำที่ผู้ขายรับได้</dt>
          <dd className="font-medium text-ink">
            {result.reserveMet ? "ถึงแล้ว" : "ยังไม่ถึง"}
          </dd>
        </div>
        {result.winner && (
          <div className="flex justify-between gap-4">
            <dt className="text-n-500">ผู้ชนะ</dt>
            <dd className="font-medium text-ink">
              {result.winner.isYours ? "คุณเอง" : result.winner.bidder}
            </dd>
          </div>
        )}
      </dl>

      {!sold && result.bidCount > 0 && !result.reserveMet && (
        // AUC-003 — says why without saying what the reserve was
        <p className="mt-4 rounded-r2 bg-n-100 px-4 py-3 text-sm text-n-600">
          มีผู้เสนอราคาแต่ยังไม่ถึงราคาขั้นต่ำที่ผู้ขายรับได้
          การประมูลจึงจบลงโดยไม่มีผู้ชนะ
        </p>
      )}
    </section>
  )
}

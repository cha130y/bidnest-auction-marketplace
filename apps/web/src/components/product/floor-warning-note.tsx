import type { SavedProduct } from "@/lib/api/types"
import { formatTHB } from "@/lib/format"

/**
 * PROD-006 / PROD-007 — the advisory `POST /products` and `PATCH /products/:id`
 * answer with when the secret negotiation floor sits below what a buyer who
 * qualifies for the quantity discount pays.
 *
 * The rule itself stays on the server (`ProductService.buildFloorWarnings`) —
 * this only decides how to say it. It is said in Thai rather than passed
 * through, because the server's own sentence names database columns and is
 * written for a log, not for a seller. The two amounts are re-derived here for
 * display only; whether to warn at all is never decided on this side.
 *
 * A warning the web has no Thai wording for is still shown verbatim rather
 * than swallowed — a seller reading an awkward sentence is recoverable, a
 * seller told nothing is not.
 */
export function FloorWarningNote({ product }: { product: SavedProduct }) {
  if (product.warnings.length === 0) return null

  const floor = product.negotiationFloor
  const discount = product.quantityDiscount
  const canExplain = floor !== null && discount !== null

  const discountedUnitPrice = canExplain
    ? Number(product.price) * (1 - Number(discount.percent) / 100)
    : null

  return (
    <div
      role="status"
      className="space-y-3 rounded-r3 border border-amber-200 bg-amber-50 px-4 py-3"
    >
      <p className="text-sm font-semibold text-amber-700">
        บันทึกแล้ว — แต่ควรตรวจสอบราคาอีกครั้ง
      </p>

      {canExplain && discountedUnitPrice !== null ? (
        <div className="space-y-2 text-sm text-n-700">
          <p>
            ราคาต่ำสุดที่ยอมรับ <b>ต่ำกว่า</b> ราคาต่อชิ้นหลังหักส่วนลดตามจำนวน
            — ผู้ซื้อที่ต่อรองราคาจึงอาจจ่ายถูกกว่าผู้ซื้อที่ซื้อครบจำนวนเพื่อรับส่วนลด
          </p>

          <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-n-500">ราคาต่ำสุดที่ยอมรับ</dt>
            <dd className="font-semibold text-ink">{formatTHB(floor)}</dd>

            <dt className="text-n-500">
              ราคาหลังหักส่วนลด {Number(discount.percent)}% (ซื้อตั้งแต่{" "}
              {discount.minQty} ชิ้น)
            </dt>
            <dd className="font-semibold text-ink">
              {formatTHB(discountedUnitPrice)}
            </dd>
          </dl>
        </div>
      ) : (
        <ul className="list-disc space-y-1 pl-5 text-sm text-n-700">
          {product.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}

      <p className="text-xs text-n-500">
        เป็นคำเตือนเท่านั้น ไม่ได้ปิดกั้นการบันทึก — ถ้าตั้งใจไว้แบบนี้ ข้ามไปได้เลย
      </p>
    </div>
  )
}

import { ApiError } from "@/lib/api/client"
import type { CartErrorBody, CartItem } from "@/lib/api/types"

/**
 * CART-001 — everything the cart says out loud when something is wrong.
 *
 * Kept in one file because the same fact reaches a buyer down two different
 * routes and used to be worded twice: `GET /cart` reports a bad line as
 * `issue`, while the routes that change a cart refuse with an error. A shelf
 * that ran out should read the same either way.
 *
 * Shared rather than left in `cart-view.tsx` because the add-to-cart and
 * buy-now buttons print the same refusals from the product page, where there
 * is no cart screen to borrow the wording from.
 */

/** What the API says is wrong with a line, said the way a buyer would say it. */
export function issueText(item: CartItem): string | null {
  switch (item.issue) {
    case "PRODUCT_UNAVAILABLE":
      return "สินค้านี้ถูกปิดการขายแล้ว เอาออกจากตะกร้าก่อนจึงจะสั่งซื้อได้"
    case "INSUFFICIENT_STOCK":
      return `ของเหลือไม่พอ — เหลืออยู่ ${item.product.stockQty} ชิ้น`
    default:
      return null
  }
}

/**
 * The same, for a change to the cart that the API refused.
 *
 * `error.message` is the API's English sentence. That is the right answer for
 * the API docs and for a non-browser client, and the wrong one on a Thai page:
 * a buyer who bumped the quantity past the shelf was reading
 * `Only 0 unit(s) of "com" are in stock`. The code is what this branches on —
 * the sentence is only the last resort for a refusal nobody has labelled yet,
 * which is still better than inventing a guess about what went wrong.
 */
export function cartErrorText(error: unknown): string {
  if (!(error instanceof ApiError)) return "ทำรายการไม่สำเร็จ"

  const body = error.body as CartErrorBody | undefined

  switch (body?.code) {
    case "INSUFFICIENT_STOCK":
      return typeof body.available === "number"
        ? `ของเหลือไม่พอ — เหลืออยู่ ${body.available} ชิ้น`
        : "ของเหลือไม่พอ"
    case "PRODUCT_UNAVAILABLE":
      return "ผู้ขายปิดการขายสินค้านี้แล้ว"
    case "OWN_LISTING":
      return "สินค้านี้เป็นประกาศของคุณเอง ซื้อเองไม่ได้"
    case "NOT_FOUND":
      return "ไม่พบสินค้านี้แล้ว — ลองรีเฟรชหน้า"
    default:
      return error.message
  }
}
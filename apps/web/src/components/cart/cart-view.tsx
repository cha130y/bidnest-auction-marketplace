"use client"

import { useState } from "react"
import Link from "next/link"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, Minus, Plus, ShoppingCart, Trash2 } from "lucide-react"

import { cartQueryKey, useCart } from "@/components/cart/cart-provider"
import { ProductImage } from "@/components/shop/product-image"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { loginHref } from "@/lib/api/auth/login-redirect"
import { removeCartItem, updateCartItem } from "@/lib/api/cart"
import { ApiError } from "@/lib/api/client"
import { checkoutHref, totalsOf } from "@/lib/cart-selection"
import { formatPercent, formatTHB } from "@/lib/format"
import type { Cart, CartItem } from "@/lib/api/types"

/**
 * CART-002/003 — the cart itself: what is in it, what it costs, and the two
 * things a buyer can do to a line without leaving the page.
 *
 * A client component rather than a server-rendered list, for the same reason
 * the header badge is one: `GET /cart` needs a token, the token lives in
 * localStorage, and a server read would 401 for everybody. It reads through
 * `useCart` so the page and the badge are the same number, never two reads
 * that can disagree.
 */
export function CartView() {
  const { cart, isLoading, isAuthenticated, isAuthReady } = useCart()

  // Nothing is claimed until localStorage has been read: showing "please sign
  // in" to somebody who is signed in is worse than showing nothing briefly.
  if (!isAuthReady || (isAuthenticated && isLoading && !cart)) {
    return (
      <div
        className="h-64 rounded-r4 bg-white shadow-sh1 motion-safe:animate-pulse"
        aria-hidden="true"
      />
    )
  }

  if (!isAuthenticated) {
    return (
      <EmptyState
        title="เข้าสู่ระบบเพื่อดูตะกร้า"
        body="ตะกร้าผูกกับบัญชีของคุณ สินค้าที่เพิ่มไว้จะยังอยู่เมื่อกลับมา"
        action={
          <Button variant="primary" size="lg" nativeButton={false} render={<Link href={loginHref()} />}>
            เข้าสู่ระบบ
          </Button>
        }
      />
    )
  }

  if (!cart || cart.items.length === 0) {
    return (
      <EmptyState
        title="ตะกร้ายังว่างอยู่"
        body="เลือกสินค้าที่ถูกใจแล้วกด “เพิ่มลงตะกร้า” ได้เลย"
        action={
          <Button variant="primary" size="lg" nativeButton={false} render={<Link href="/shop" />}>
            ไปเลือกสินค้า
          </Button>
        }
      />
    )
  }

  return <CartBody cart={cart} />
}

function CartBody({ cart }: { cart: Cart }) {
  /**
   * What the buyer has *un*ticked, rather than what they have ticked.
   *
   * Everything starts selected — they came here to pay for their cart, and
   * making them select it first would add a step for the sake of the times
   * they want less. Holding the negative is what keeps that true as the cart
   * changes: a line added in another tab is selected because it is absent from
   * this set, with nothing to remember to do about it.
   */
  const [unselected, setUnselected] = useState<Set<string>>(() => new Set())

  // Ids of lines that are gone — removed here or in another tab — are filtered
  // out as the selection is read rather than pruned by an effect. An effect
  // would mean a second render to correct the first, and the stale id in state
  // harms nothing once nothing reads it. Without this, one unticked line that
  // was then deleted would keep "select all" half-ticked over a cart that is
  // entirely ticked.
  const selected = new Set(
    cart.items.map((item) => item.id).filter((id) => !unselected.has(id))
  )

  const toggle = (id: string, checked: boolean) =>
    setUnselected((current) => {
      const next = new Set(current)
      if (checked) next.delete(id)
      else next.add(id)
      return next
    })

  const allSelected = selected.size === cart.items.length

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
      <div className="space-y-4">
        <label className="flex cursor-pointer items-center gap-3 rounded-r4 bg-white px-4 py-3 shadow-sh1">
          <Checkbox
            checked={allSelected}
            indeterminate={selected.size > 0 && !allSelected}
            onCheckedChange={(checked) =>
              setUnselected(
                checked ? new Set() : new Set(cart.items.map((item) => item.id))
              )
            }
          />
          <span className="text-sm font-semibold text-ink">
            เลือกทั้งหมด ({cart.items.length} รายการ)
          </span>
        </label>

        <ul className="space-y-4">
          {cart.items.map((item) => (
            <CartLine
              key={item.id}
              item={item}
              selected={selected.has(item.id)}
              onSelectedChange={(checked) => toggle(item.id, checked)}
            />
          ))}
        </ul>
      </div>

      <CartSummary cart={cart} selected={selected} />
    </div>
  )
}

function EmptyState({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action: React.ReactNode
}) {
  return (
    <div className="rounded-r4 bg-white px-6 py-16 text-center shadow-sh1">
      <ShoppingCart className="mx-auto size-10 text-n-300" aria-hidden="true" />
      <h2 className="mt-4 font-display text-xl font-bold text-ink">{title}</h2>
      <p className="mx-auto mt-2 max-w-100 text-base text-n-600">{body}</p>
      <div className="mt-6 flex justify-center">{action}</div>
    </div>
  )
}

/** What the API says is wrong with a line, said the way a buyer would say it. */
function issueText(item: CartItem): string | null {
  switch (item.issue) {
    case "PRODUCT_UNAVAILABLE":
      return "สินค้านี้ถูกปิดการขายแล้ว เอาออกจากตะกร้าก่อนจึงจะสั่งซื้อได้"
    case "INSUFFICIENT_STOCK":
      return `ของเหลือไม่พอ — เหลืออยู่ ${item.product.stockQty} ชิ้น`
    default:
      return null
  }
}

function CartLine({
  item,
  selected,
  onSelectedChange,
}: {
  item: CartItem
  selected: boolean
  onSelectedChange: (checked: boolean) => void
}) {
  const queryClient = useQueryClient()

  // Both routes answer with the whole cart, so the result is written straight
  // into the shared query instead of refetching it. That is also what moves
  // the header badge — same key, one source.
  const settle = (cart: Cart) => queryClient.setQueryData(cartQueryKey, cart)

  const changeQuantity = useMutation({
    mutationFn: (quantity: number) => updateCartItem(item.id, quantity),
    onSuccess: settle,
  })

  const remove = useMutation({
    mutationFn: () => removeCartItem(item.id),
    onSuccess: settle,
  })

  const busy = changeQuantity.isPending || remove.isPending
  const error = changeQuantity.error ?? remove.error
  const problem = issueText(item)

  // The listing's own stock is the ceiling. The API enforces it too, and its
  // answer is the one that counts — this only saves a round trip that was
  // always going to be refused.
  const atStockLimit =
    item.product.stockQty > 0 && item.quantity >= item.product.stockQty

  return (
    <li className="rounded-r4 bg-white p-4 shadow-sh1">
      <div className="flex gap-4">
        <Checkbox
          checked={selected}
          onCheckedChange={onSelectedChange}
          className="mt-1 shrink-0"
          aria-label={`เลือก ${item.product.title} มาชำระเงิน`}
        />

        <Link href={`/shop/${item.product.id}`} className="shrink-0">
          <ProductImage
            src={item.product.imageUrl}
            alt={item.product.title}
            className="size-24 rounded-r3 object-cover"
          />
        </Link>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Link
            href={`/shop/${item.product.id}`}
            className="line-clamp-2 font-display font-semibold text-ink transition-colors hover:text-amber-600"
          >
            {item.product.title}
          </Link>
          <span className="text-xs text-n-500">
            โดย {item.seller.displayName ?? "ไม่ระบุชื่อ"}
          </span>

          <div className="mt-1 flex flex-wrap items-baseline gap-2">
            <span className="font-semibold text-ink">
              {formatTHB(item.effectiveUnitPrice)}
            </span>
            {/* PROD-007 — the struck-through price only appears once the
                quantity actually reaches the discount's minimum */}
            {item.discountPercent && (
              <>
                <span className="text-sm text-n-500 line-through">
                  {formatTHB(item.unitPrice)}
                </span>
                <span className="text-xs font-semibold text-green">
                  ลด {formatPercent(item.discountPercent)}
                </span>
              </>
            )}
          </div>

          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-3">
            <div className="flex items-center gap-1">
              <Button
                variant="secondary"
                size="icon"
                className="size-9"
                aria-label="ลดจำนวน"
                disabled={busy || item.quantity <= 1}
                onClick={() => changeQuantity.mutate(item.quantity - 1)}
              >
                <Minus className="size-4" />
              </Button>
              <span
                aria-live="polite"
                className="min-w-10 text-center font-semibold text-ink"
              >
                {item.quantity}
              </span>
              <Button
                variant="secondary"
                size="icon"
                className="size-9"
                aria-label="เพิ่มจำนวน"
                disabled={busy || atStockLimit}
                onClick={() => changeQuantity.mutate(item.quantity + 1)}
              >
                <Plus className="size-4" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="ml-1 size-9 text-n-500 hover:text-red"
                aria-label={`เอา ${item.product.title} ออกจากตะกร้า`}
                disabled={busy}
                onClick={() => remove.mutate()}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>

            <span className="font-display text-lg font-bold text-ink">
              {formatTHB(item.subtotal)}
            </span>
          </div>
        </div>
      </div>

      {problem && (
        <p className="mt-3 flex items-start gap-2 rounded-r3 bg-red-50 px-3 py-2 text-sm font-medium text-red">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {problem}
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-red">
          {error instanceof ApiError ? error.message : "ทำรายการไม่สำเร็จ"}
        </p>
      )}
    </li>
  )
}

function CartSummary({
  cart,
  selected,
}: {
  cart: Cart
  selected: Set<string>
}) {
  const chosen = cart.items.filter((item) => selected.has(item.id))
  const totals = totalsOf(chosen)

  // Only what is being paid for can block the payment. A broken line the buyer
  // has unticked is not in this checkout and holds nothing up — which is now
  // the quickest way past one, and better than the old advice to delete it.
  const blockingItems = chosen.filter((item) => item.issue !== null).length
  const nothingChosen = chosen.length === 0

  return (
    <aside className="rounded-r4 bg-white p-6 shadow-sh1 lg:sticky lg:top-6">
      <h2 className="font-display text-lg font-bold text-ink">สรุปคำสั่งซื้อ</h2>

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-n-600">จำนวนสินค้า</dt>
          <dd className="font-semibold text-ink">{totals.itemCount} ชิ้น</dd>
        </div>
        {Number(totals.discountTotal) > 0 && (
          <div className="flex justify-between">
            <dt className="text-n-600">ส่วนลด</dt>
            <dd className="font-semibold text-green">
              −{formatTHB(totals.discountTotal)}
            </dd>
          </div>
        )}
        {/* Said plainly rather than left to be inferred from a total that
            dropped: the cart still holds things this payment will not cover. */}
        {chosen.length < cart.items.length && (
          <div className="flex justify-between">
            <dt className="text-n-600">ไม่ได้เลือก</dt>
            <dd className="font-semibold text-n-500">
              {cart.items.length - chosen.length} รายการ
            </dd>
          </div>
        )}
      </dl>

      <div className="mt-4 flex items-baseline justify-between border-t border-n-200 pt-4">
        <span className="font-semibold text-ink">ยอดรวม</span>
        <span className="font-display text-2xl font-extrabold text-ink">
          {formatTHB(totals.total)}
        </span>
      </div>

      {/* CART-003 — said before checkout rather than discovered after it: the
          server splits one payment into an order per seller. Counted over the
          selection, since that is what will be split. */}
      {totals.sellerCount > 1 && (
        <p className="mt-3 rounded-r3 bg-n-100 px-3 py-2 text-xs text-n-600">
          รายการที่เลือกมีสินค้าจาก {totals.sellerCount} ร้าน
          เมื่อชำระเงินจะถูกแยกเป็น {totals.sellerCount} คำสั่งซื้อ
          และจัดส่งแยกกัน
        </p>
      )}

      {blockingItems > 0 && (
        <p className="mt-3 rounded-r3 bg-red-50 px-3 py-2 text-xs font-medium text-red">
          มี {blockingItems} รายการที่เลือกไว้สั่งซื้อไม่ได้ —
          แก้จำนวน เอาออก หรือติ๊กออกก่อน
        </p>
      )}

      {/* Still refused while a selected line has a problem — checkout would be
          rejected whole, and this is the only screen that can fix it. */}
      {nothingChosen || blockingItems > 0 ? (
        <Button variant="primary" size="lg" block className="mt-5" disabled>
          {nothingChosen ? "ยังไม่ได้เลือกรายการ" : "ดำเนินการชำระเงิน"}
        </Button>
      ) : (
        <Button
          variant="primary"
          size="lg"
          block
          className="mt-5"
          nativeButton={false}
          render={<Link href={checkoutHref(cart, selected)} />}
        >
          ดำเนินการชำระเงิน
        </Button>
      )}

      <Button
        variant="ghost"
        size="sm"
        block
        className="mt-2"
        nativeButton={false}
        render={<Link href="/shop" />}
      >
        เลือกสินค้าเพิ่ม
      </Button>
    </aside>
  )
}
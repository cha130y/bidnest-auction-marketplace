"use client"

import { useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  XCircle,
} from "lucide-react"

import { cartQueryKey, useCart } from "@/components/cart/cart-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { loginHref } from "@/lib/api/auth/login-redirect"
import { ApiError } from "@/lib/api/client"
import { checkout } from "@/lib/api/orders"
import {
  SELECTION_PARAM,
  parseSelection,
  selectedItems,
  totalsOf,
} from "@/lib/cart-selection"
import { formatTHB } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { CartItem, CheckoutResult, PaymentMethod } from "@/lib/api/types"

/**
 * How long the "processing" screen stays up at minimum.
 *
 * The charge is simulated and answers almost instantly, which reads as though
 * nothing was checked at all — a payment that flickers is a payment nobody
 * trusts. Held against the request rather than added to it, so a slow answer
 * does not wait twice.
 */
const MIN_PROCESSING_MS = 3_000

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** CART-004 — what the API says went wrong, when it says anything. */
function declineReason(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null
  const body = error.body
  if (typeof body === "object" && body !== null && "reason" in body) {
    const { reason } = body as { reason: unknown }
    if (typeof reason === "string") return reason
  }
  return null
}

/** The three the API accepts, said the way a buyer reads them. */
const PAYMENT_METHODS: { value: PaymentMethod; label: string; hint: string }[] =
  [
    { value: "CARD", label: "บัตรเครดิต / เดบิต", hint: "Visa, Mastercard" },
    { value: "BANK_TRANSFER", label: "โอนผ่านธนาคาร", hint: "พร้อมเพย์ / โอนบัญชี" },
    { value: "E_WALLET", label: "กระเป๋าเงินอิเล็กทรอนิกส์", hint: "TrueMoney, Rabbit LINE Pay" },
  ]

/**
 * CART-004/005 — the address, the method, and the one call that turns a cart
 * into orders.
 *
 * The cart is read through `useCart` rather than fetched again: this screen
 * has to agree with the page the buyer just came from about what they are
 * paying for, and two reads could disagree.
 */
export function CheckoutView() {
  const { cart, isLoading, isAuthenticated, isAuthReady } = useCart()
  const [result, setResult] = useState<CheckoutResult | null>(null)
  // CART-003 — which lines the buyer ticked in the cart. Absent means all of
  // them, which is what every link into this page meant before selection.
  const selection = parseSelection(useSearchParams().get(SELECTION_PARAM))

  // The receipt outlives the cart it came from — checkout empties the cart, so
  // this has to be checked before the "cart is empty" branch below or a
  // successful payment would show as an empty cart.
  if (result) return <Receipt result={result} />

  if (!isAuthReady || (isAuthenticated && isLoading && !cart)) {
    return (
      <div
        className="h-96 rounded-r4 bg-white shadow-sh1 motion-safe:animate-pulse"
        aria-hidden="true"
      />
    )
  }

  if (!isAuthenticated) {
    return (
      <Notice title="เข้าสู่ระบบก่อนชำระเงิน">
        <Button variant="primary" size="lg" nativeButton={false} render={<Link href={loginHref()} />}>
          เข้าสู่ระบบ
        </Button>
      </Notice>
    )
  }

  if (!cart || cart.items.length === 0) {
    return (
      <Notice title="ไม่มีสินค้าให้ชำระเงิน">
        <Button variant="primary" size="lg" nativeButton={false} render={<Link href="/shop" />}>
          ไปเลือกสินค้า
        </Button>
      </Notice>
    )
  }

  const paying = selectedItems(cart, selection)

  // The selection outlived the lines it named — removed in another tab, or
  // already bought. The cart is not empty, so the message above would be a lie;
  // this sends them back to choose again rather than quietly charging for
  // whatever survived.
  if (paying.length === 0) {
    return (
      <Notice title="รายการที่เลือกไว้ไม่อยู่ในตะกร้าแล้ว">
        <p className="mb-6 text-base text-n-600">
          อาจถูกเอาออกหรือสั่งซื้อไปแล้วจากอีกแท็บหนึ่ง — เลือกใหม่อีกครั้ง
        </p>
        <Button variant="primary" size="lg" nativeButton={false} render={<Link href="/cart" />}>
          กลับไปที่ตะกร้า
        </Button>
      </Notice>
    )
  }

  const blocking = paying.filter((item) => item.issue !== null)

  // The API refuses the whole checkout over one bad line, so this sends them
  // back to the only screen that can fix it rather than letting them fill in
  // an address first and be refused after.
  if (blocking.length > 0) {
    return (
      <Notice title={`มี ${blocking.length} รายการที่สั่งซื้อไม่ได้`}>
        <p className="mb-6 text-base text-n-600">
          แก้จำนวนหรือเอาออกจากตะกร้าก่อนจึงจะชำระเงินได้
        </p>
        <Button variant="primary" size="lg" nativeButton={false} render={<Link href="/cart" />}>
          กลับไปที่ตะกร้า
        </Button>
      </Notice>
    )
  }

  return <CheckoutForm items={paying} onDone={setResult} />
}

function Notice({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-r4 bg-white px-6 py-16 text-center shadow-sh1">
      <h2 className="font-display text-xl font-bold text-ink">{title}</h2>
      <div className="mt-6 flex flex-col items-center">{children}</div>
    </div>
  )
}

function CheckoutForm({
  items,
  onDone,
}: {
  /** CART-003 — the lines this payment covers, already narrowed to the pick. */
  items: CartItem[]
  onDone: (result: CheckoutResult) => void
}) {
  const { cart } = useCart()
  const queryClient = useQueryClient()
  const [method, setMethod] = useState<PaymentMethod>("CARD")
  const totals = totalsOf(items)
  const isPartial = (cart?.items.length ?? 0) > items.length

  const [showFailure, setShowFailure] = useState(false)

  const pay = useMutation({
    mutationFn: async (form: FormData) => {
      // Held alongside the request, not before it — a charge that takes longer
      // than the floor does not then wait out the floor as well.
      const [result] = await Promise.all([
        checkout({
          paymentMethod: method,
          shippingAddress: {
            recipientName: String(form.get("recipientName") ?? "").trim(),
            line1: String(form.get("line1") ?? "").trim(),
            // Omitted rather than sent empty: the field is optional, and "" is
            // not the same as "no second line".
            line2: String(form.get("line2") ?? "").trim() || undefined,
            city: String(form.get("city") ?? "").trim(),
            postalCode: String(form.get("postalCode") ?? "").trim(),
            phone: String(form.get("phone") ?? "").trim(),
          },
          // Sent only when it means something. Omitting it on a whole-cart
          // checkout keeps that request identical to what it always was, and
          // leaves nothing to go stale between here and the server.
          ...(isPartial ? { cartItemIds: items.map((item) => item.id) } : {}),
        }),
        wait(MIN_PROCESSING_MS),
      ])

      return result
    },
    onSuccess: (result) => {
      // Checkout empties the cart server-side; without this the header badge
      // would keep the old count until something else happened to refetch.
      void queryClient.invalidateQueries({ queryKey: cartQueryKey })
      onDone(result)
    },
    onError: () => setShowFailure(true),
  })

  return (
    <>
      {/* Both live above the form rather than replacing it. The address is in
          uncontrolled inputs, so unmounting to show a result would throw away
          everything the buyer typed — and "try again" would mean typing it all
          a second time. */}
      {pay.isPending && <ProcessingOverlay />}
      {showFailure && !pay.isPending && (
        <FailureOverlay
          error={pay.error}
          onRetry={() => {
            setShowFailure(false)
            pay.reset()
          }}
        />
      )}

    <form
      onSubmit={(event) => {
        event.preventDefault()
        pay.mutate(new FormData(event.currentTarget))
      }}
      className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start"
    >
      <div className="space-y-6">
        <section className="rounded-r4 bg-white p-6 shadow-sh1">
          <h2 className="font-display text-lg font-bold text-ink">
            ที่อยู่จัดส่ง
          </h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field name="recipientName" label="ชื่อผู้รับ" maxLength={150} className="sm:col-span-2" />
            <Field name="line1" label="ที่อยู่" maxLength={200} className="sm:col-span-2" />
            <Field
              name="line2"
              label="ที่อยู่เพิ่มเติม"
              maxLength={200}
              optional
              className="sm:col-span-2"
            />
            <Field name="city" label="จังหวัด / เขต" maxLength={100} />
            <Field name="postalCode" label="รหัสไปรษณีย์" maxLength={20} />
            <Field name="phone" label="เบอร์โทรศัพท์" maxLength={30} type="tel" className="sm:col-span-2" />
          </div>
        </section>

        <section className="rounded-r4 bg-white p-6 shadow-sh1">
          <h2 className="font-display text-lg font-bold text-ink">
            วิธีชำระเงิน
          </h2>

          <fieldset className="mt-4 space-y-2">
            <legend className="sr-only">เลือกวิธีชำระเงิน</legend>
            {PAYMENT_METHODS.map((option) => (
              <label
                key={option.value}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-r3 border px-4 py-3 transition-colors",
                  method === option.value
                    ? "border-amber-500 bg-amber-50"
                    : "border-n-200 hover:border-n-300"
                )}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value={option.value}
                  checked={method === option.value}
                  onChange={() => setMethod(option.value)}
                  className="size-4 accent-amber-500"
                />
                <span className="flex-1">
                  <span className="block font-semibold text-ink">
                    {option.label}
                  </span>
                  <span className="block text-xs text-n-500">{option.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {/* SRS 1.2 — no gateway is contacted. Said on screen so nobody
              believes they have entered a real payment. */}
          <p className="mt-4 flex items-start gap-2 rounded-r3 bg-n-100 px-3 py-2 text-xs text-n-600">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            ระบบชำระเงินเป็นการจำลองสำหรับโครงการนี้ ไม่มีการตัดเงินจริง
            และไม่ต้องกรอกข้อมูลบัตร
          </p>
        </section>
      </div>

      <aside className="rounded-r4 bg-white p-6 shadow-sh1 lg:sticky lg:top-6">
        <h2 className="font-display text-lg font-bold text-ink">สรุปยอด</h2>

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
        </dl>

        <div className="mt-4 flex items-baseline justify-between border-t border-n-200 pt-4">
          <span className="font-semibold text-ink">ยอดที่ต้องชำระ</span>
          <span className="font-display text-2xl font-extrabold text-ink">
            {formatTHB(totals.total)}
          </span>
        </div>

        {/* CART-003 — the split is decided by what is being paid for, not by
            this form */}
        {totals.sellerCount > 1 && (
          <p className="mt-3 rounded-r3 bg-n-100 px-3 py-2 text-xs text-n-600">
            จ่ายครั้งเดียว แล้วระบบจะแยกเป็น {totals.sellerCount} คำสั่งซื้อ
            ตามร้าน
          </p>
        )}

        {/* The buyer chose this on the previous screen, but the address form
            is long enough that it is worth repeating what is not in it. */}
        {isPartial && (
          <p className="mt-3 rounded-r3 bg-amber-50 px-3 py-2 text-xs text-ink">
            ชำระเฉพาะ {items.length} รายการที่เลือกไว้ — อีก{" "}
            {(cart?.items.length ?? 0) - items.length} รายการจะยังอยู่ในตะกร้า
          </p>
        )}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          block
          className="mt-5"
          disabled={pay.isPending}
        >
          {pay.isPending ? "กำลังดำเนินการ…" : "ยืนยันการชำระเงิน"}
        </Button>

        {/* A failure is reported by the overlay above, not here — it is the
            whole screen's answer, not a footnote under the button. */}

        <Button
          variant="ghost"
          size="sm"
          block
          className="mt-2"
          nativeButton={false}
          render={<Link href="/cart" />}
        >
          กลับไปแก้ตะกร้า
        </Button>
      </aside>
    </form>
    </>
  )
}

/** CART-004 — the wait, made visible. */
function ProcessingOverlay() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 grid place-items-center bg-ink/40 backdrop-blur-sm"
    >
      <div className="mx-4 w-full max-w-100 rounded-r4 bg-white px-6 py-10 text-center shadow-sh2">
        <Loader2
          className="mx-auto size-10 animate-spin text-amber-500"
          aria-hidden="true"
        />
        <p className="mt-4 font-display text-lg font-bold text-ink">
          กำลังดำเนินการชำระเงิน
        </p>
        <p className="mt-1 text-sm text-n-600">
          กรุณาอย่าปิดหน้านี้หรือกดย้อนกลับ
        </p>
      </div>
    </div>
  )
}

/**
 * CART-004 — the charge was refused.
 *
 * Nothing was created: the API declines before it opens the transaction, so
 * the cart is exactly as it was and pressing again is a real retry, not a
 * risk of paying twice. Saying so is the point of this screen — a buyer who
 * is not told will go and check their cart, or worse, their bank.
 */
function FailureOverlay({
  error,
  onRetry,
}: {
  error: unknown
  onRetry: () => void
}) {
  const reason = declineReason(error)

  return (
    <div
      role="alertdialog"
      aria-labelledby="checkout-failed-title"
      className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-110 rounded-r4 bg-white px-6 py-8 text-center shadow-sh2">
        <XCircle className="mx-auto size-10 text-red" aria-hidden="true" />
        <h2
          id="checkout-failed-title"
          className="mt-4 font-display text-xl font-extrabold text-ink"
        >
          ชำระเงินไม่สำเร็จ
        </h2>

        <p className="mt-2 text-sm text-n-600">
          {error instanceof ApiError
            ? error.message
            : "เกิดข้อผิดพลาดระหว่างชำระเงิน"}
          {reason && (
            <span className="mt-1 block text-xs text-n-500">
              เหตุผลจากระบบชำระเงิน: {reason}
            </span>
          )}
        </p>

        <p className="mt-4 flex items-start gap-2 rounded-r3 bg-n-100 px-3 py-2 text-left text-xs text-n-600">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          ยังไม่มีการตัดเงินและยังไม่มีคำสั่งซื้อเกิดขึ้น
          สินค้าในตะกร้าของคุณยังอยู่ครบ กดลองใหม่ได้ทันที
        </p>

        <div className="mt-6 flex flex-col gap-2">
          <Button variant="primary" size="lg" block onClick={onRetry}>
            ลองใหม่อีกครั้ง
          </Button>
          <Button
            variant="ghost"
            size="sm"
            block
            nativeButton={false}
            render={<Link href="/cart" />}
          >
            กลับไปแก้ตะกร้า
          </Button>
        </div>
      </div>
    </div>
  )
}

function Field({
  name,
  label,
  maxLength,
  optional,
  type = "text",
  className,
}: {
  name: string
  label: string
  maxLength: number
  optional?: boolean
  type?: string
  className?: string
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={name}>
        {label}
        {!optional && <span className="ml-1 text-rose-600">*</span>}
      </Label>
      <Input
        id={name}
        name={name}
        type={type}
        required={!optional}
        maxLength={maxLength}
      />
    </div>
  )
}

/**
 * CART-005 — what the payment produced.
 *
 * Shown here rather than by redirecting to an order, because one payment can
 * become several orders and there would be no single one to redirect to.
 */
function Receipt({ result }: { result: CheckoutResult }) {
  return (
    <div className="rounded-r4 bg-white p-6 shadow-sh1 md:p-8">
      <div className="text-center">
        <CheckCircle2 className="mx-auto size-12 text-green" aria-hidden="true" />
        <h2 className="mt-4 font-display text-2xl font-extrabold text-ink">
          ชำระเงินเรียบร้อย
        </h2>
        <p className="mt-2 text-base text-n-600">
          ยอดรวม {formatTHB(result.total)} ·{" "}
          {result.orders.length > 1
            ? `แยกเป็น ${result.orders.length} คำสั่งซื้อตามร้าน`
            : "1 คำสั่งซื้อ"}
        </p>
      </div>

      <dl className="mx-auto mt-6 max-w-120 space-y-1 rounded-r3 bg-n-100 px-4 py-3 text-xs text-n-600">
        <div className="flex justify-between gap-4">
          <dt>รหัสการชำระเงิน</dt>
          <dd className="font-mono break-all text-ink">
            {result.paymentReference}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>รหัสรายการ</dt>
          <dd className="font-mono break-all text-ink">
            {result.checkoutSessionId}
          </dd>
        </div>
      </dl>

      <ul className="mx-auto mt-6 max-w-120 space-y-2">
        {result.orders.map((order, index) => (
          <li key={order.id}>
            <Link
              href={`/orders/${order.id}`}
              className="flex items-center justify-between gap-4 rounded-r3 border border-n-200 px-4 py-3 transition-colors hover:border-amber-500"
            >
              <span className="font-semibold text-ink">
                คำสั่งซื้อที่ {index + 1}
              </span>
              <span className="font-display font-bold text-ink">
                {formatTHB(order.subtotal)}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-8 flex flex-col items-center gap-2">
        <Button variant="primary" size="lg" nativeButton={false} render={<Link href="/orders" />}>
          ดูคำสั่งซื้อทั้งหมด
        </Button>
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/shop" />}>
          เลือกสินค้าต่อ
        </Button>
      </div>
    </div>
  )
}
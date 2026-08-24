"use client"

import { useState } from "react"
import Link from "next/link"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react"

import { cartQueryKey, useCart } from "@/components/cart/cart-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { loginHref } from "@/lib/api/auth/login-redirect"
import { ApiError } from "@/lib/api/client"
import { checkout } from "@/lib/api/orders"
import { formatTHB } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { CheckoutResult, PaymentMethod } from "@/lib/api/types"

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

  const blocking = cart.items.filter((item) => item.issue !== null)

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

  return <CheckoutForm onDone={setResult} />
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

function CheckoutForm({ onDone }: { onDone: (result: CheckoutResult) => void }) {
  const { cart } = useCart()
  const queryClient = useQueryClient()
  const [method, setMethod] = useState<PaymentMethod>("CARD")

  const pay = useMutation({
    mutationFn: (form: FormData) =>
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
      }),
    onSuccess: (result) => {
      // Checkout empties the cart server-side; without this the header badge
      // would keep the old count until something else happened to refetch.
      void queryClient.invalidateQueries({ queryKey: cartQueryKey })
      onDone(result)
    },
  })

  return (
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
            <dd className="font-semibold text-ink">
              {cart?.summary.itemCount ?? 0} ชิ้น
            </dd>
          </div>
          {Number(cart?.summary.discountTotal ?? 0) > 0 && (
            <div className="flex justify-between">
              <dt className="text-n-600">ส่วนลด</dt>
              <dd className="font-semibold text-green">
                −{formatTHB(cart!.summary.discountTotal)}
              </dd>
            </div>
          )}
        </dl>

        <div className="mt-4 flex items-baseline justify-between border-t border-n-200 pt-4">
          <span className="font-semibold text-ink">ยอดที่ต้องชำระ</span>
          <span className="font-display text-2xl font-extrabold text-ink">
            {formatTHB(cart?.summary.total ?? "0")}
          </span>
        </div>

        {/* CART-003 — the split is decided by the cart, not by this form */}
        {(cart?.sellerCount ?? 0) > 1 && (
          <p className="mt-3 rounded-r3 bg-n-100 px-3 py-2 text-xs text-n-600">
            จ่ายครั้งเดียว แล้วระบบจะแยกเป็น {cart!.sellerCount} คำสั่งซื้อ
            ตามร้าน
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

        {pay.error && (
          <p
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-r3 bg-red-50 px-3 py-2 text-sm font-medium text-red"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {pay.error instanceof ApiError
              ? pay.error.message
              : "ชำระเงินไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"}
          </p>
        )}

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
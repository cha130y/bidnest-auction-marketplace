"use client"

import { useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react"

import { cartQueryKey, useCart } from "@/components/cart/cart-provider"
import {
  FailureOverlay,
  checkoutFailure,
} from "@/components/checkout/failure-overlay"
import { ordersQueryKey } from "@/components/order/order-list"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { loginHref } from "@/lib/api/auth/login-redirect"
import { checkout } from "@/lib/api/orders"
import {
  getMyProfile,
  myProfileQueryKey,
  type MyProfile,
} from "@/lib/api/users"
import { getArena } from "@/lib/api/auctions"
import {
  AUCTION_PARAM,
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

/** The six address inputs, keyed the way both the form and the API name them. */
type AddressDefaults = Record<
  "recipientName" | "line1" | "line2" | "city" | "postalCode" | "phone",
  string
>

const NO_ADDRESS: AddressDefaults = {
  recipientName: "",
  line1: "",
  line2: "",
  city: "",
  postalCode: "",
  phone: "",
}

/**
 * CART-004 — the buyer's saved address, as starting values for the form.
 *
 * A straight rename and nothing more: the profile stores exactly these six
 * fields at exactly these widths, which is the whole reason USR-001 was
 * reshaped. Nothing is derived or guessed — in particular `recipientName` is
 * not filled in from the account's own name, because the person a parcel is
 * addressed to is not always the person paying, and a wrong name silently
 * prefilled is worse than an empty box somebody has to look at.
 */
function profileAddressDefaults(profile: MyProfile | undefined): AddressDefaults {
  if (!profile) return NO_ADDRESS

  return {
    recipientName: profile.profile.recipientName ?? "",
    line1: profile.profile.line1 ?? "",
    line2: profile.profile.line2 ?? "",
    city: profile.profile.city ?? "",
    postalCode: profile.profile.postalCode ?? "",
    phone: profile.profile.phone ?? "",
  }
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
  const params = useSearchParams()
  // A winner paying for a lot. Checked before anything to do with the cart,
  // because arriving with this is a deliberate act and an empty cart is not —
  // a winner with nothing in their basket must not be sent shopping.
  const auctionId = params.get(AUCTION_PARAM)

  if (auctionId) return <AuctionCheckout auctionId={auctionId} />

  return <CartCheckout />
}

/**
 * CART-004 — a refused payment, held above everything that could withdraw it.
 *
 * The overlay cannot live inside the form. A refusal over stock invalidates
 * the cart — deliberately, so the cart screen agrees about what is left — and
 * the refreshed cart no longer passes the gate below, which unmounts the form
 * and every screen it was drawing. The buyer sees the explanation appear and
 * vanish in the same instant.
 *
 * So it is hoisted here, for the same reason and to the same place as the
 * receipt: an answer about a payment has to outlive the conditions that
 * produced it.
 *
 * The gate underneath is free to fall through to a notice while this is up —
 * that notice is the correct thing to be standing behind the overlay once it
 * is dismissed, since the cart really does need fixing by then.
 */
function CartCheckout() {
  const [failure, setFailure] = useState<unknown>(null)

  return (
    <>
      {failure !== null && (
        <FailureOverlay
          error={failure}
          context="CART"
          onRetry={() => setFailure(null)}
        />
      )}
      <CartGate onFailed={setFailure} />
    </>
  )
}

function CartGate({ onFailed }: { onFailed: (error: unknown) => void }) {
  const { cart, isPending, isAuthenticated, isAuthReady } = useCart()
  const [result, setResult] = useState<CheckoutResult | null>(null)
  // CART-003 — which lines the buyer ticked in the cart. Absent means all of
  // them, which is what every link into this page meant before selection.
  const selection = parseSelection(useSearchParams().get(SELECTION_PARAM))

  // The receipt outlives the cart it came from — checkout empties the cart, so
  // this has to be checked before the "cart is empty" branch below or a
  // successful payment would show as an empty cart.
  if (result) return <Receipt result={result} />

  // Waits for the cart itself, not just for the request to be in flight. On
  // the render where the token has landed but the fetch has not started, the
  // old condition fell through and flashed "ไม่มีสินค้าให้ชำระเงิน" — the one
  // screen a buyer arriving at checkout must never be shown by accident.
  if (!isAuthReady || (isAuthenticated && isPending)) {
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

  return (
    <CheckoutForm
      payable={{
        kind: "CART",
        items: paying,
        isPartial: cart.items.length > paying.length,
      }}
      onDone={setResult}
      onFailed={onFailed}
    />
  )
}

/**
 * A winner paying for the lot they won.
 *
 * Reads the arena rather than the auction: the auction alone says what it sold
 * for, but not whether the person looking is the one who has to pay for it.
 * `result.winner.isYours` is the same answer the result screen uses to decide
 * whether to show the button that leads here, so the two agree by construction
 * instead of by coincidence.
 *
 * Every refusal below is also enforced by the API. Repeated here so a winner
 * finds out before filling in an address, never after.
 */
function AuctionCheckout({ auctionId }: { auctionId: string }) {
  const [failure, setFailure] = useState<unknown>(null)

  return (
    <>
      {/* Hoisted for the same reason as the cart's — see `CartCheckout`. A lot
          paid for in another tab makes the gate below refuse this one, and the
          screen saying so must not be taken down by that refusal. */}
      {failure !== null && (
        <FailureOverlay
          error={failure}
          context="AUCTION"
          onRetry={() => setFailure(null)}
        />
      )}
      <AuctionGate auctionId={auctionId} onFailed={setFailure} />
    </>
  )
}

function AuctionGate({
  auctionId,
  onFailed,
}: {
  auctionId: string
  onFailed: (error: unknown) => void
}) {
  const { isAuthenticated, isAuthReady } = useCart()
  const [result, setResult] = useState<CheckoutResult | null>(null)

  const arena = useQuery({
    queryKey: ["auctions", auctionId, "arena"],
    queryFn: () => getArena(auctionId),
    retry: false,
  })

  if (result) return <Receipt result={result} />

  if (!isAuthReady || (isAuthenticated && arena.isPending)) {
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

  if (arena.isError || !arena.data) {
    return (
      <Notice title="เปิดรายการประมูลนี้ไม่ได้">
        <Button variant="primary" size="lg" nativeButton={false} render={<Link href="/auctions" />}>
          กลับไปหน้าประมูล
        </Button>
      </Notice>
    )
  }

  const { auction, result: outcome } = arena.data

  // Not yours, or not sold, or still running. One message for all three: a
  // page that distinguished them would tell anybody holding a lot id how that
  // auction ended and who won it.
  if (!outcome || outcome.winner?.isYours !== true || !outcome.soldPrice) {
    return (
      <Notice title="ไม่มีรายการที่ต้องชำระเงิน">
        <p className="mb-6 text-base text-n-600">
          รายการนี้อาจยังไม่จบ ไม่ได้จบด้วยการขาย หรือไม่ใช่รายการที่คุณชนะ
        </p>
        <Button
          variant="primary"
          size="lg"
          nativeButton={false}
          render={<Link href={`/auctions/${auctionId}`} />}
        >
          ดูรายการประมูล
        </Button>
      </Notice>
    )
  }

  return (
    <CheckoutForm
      payable={{
        kind: "AUCTION",
        auctionId,
        title: auction.title,
        soldPrice: outcome.soldPrice,
      }}
      onDone={setResult}
      onFailed={onFailed}
    />
  )
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

/**
 * What this payment is for.
 *
 * The address form, the payment methods, the processing and failure screens
 * and the receipt are identical either way — the two differ only in what is
 * being bought and what the request has to say about it. Kept as one component
 * with a two-shaped input rather than two components sharing a form, because
 * the form is nearly all of it.
 */
type Payable =
  | {
      kind: "CART"
      /** CART-003 — the lines this payment covers, already narrowed to the pick. */
      items: CartItem[]
      /** Whether anything is being left behind in the cart. */
      isPartial: boolean
    }
  | { kind: "AUCTION"; auctionId: string; title: string; soldPrice: string }

/**
 * The one shape the summary panel and the request are both built from.
 *
 * A lot has no discount and exactly one seller, so those come out constant on
 * that side rather than being computed — the arithmetic in `totalsOf` is about
 * adding up cart lines, and there is nothing here to add up.
 */
function summarise(payable: Payable) {
  if (payable.kind === "AUCTION") {
    return {
      itemCount: 1,
      discountTotal: "0",
      total: payable.soldPrice,
      sellerCount: 1,
      leftInCart: 0,
      /** What the buyer is paying for, when it is not a basket. */
      lotTitle: payable.title,
      request: { auctionId: payable.auctionId },
    }
  }

  const totals = totalsOf(payable.items)

  return {
    ...totals,
    leftInCart: payable.isPartial ? payable.items.length : 0,
    lotTitle: null,
    // Sent only when it means something. Omitting it on a whole-cart checkout
    // keeps that request identical to what it always was, and leaves nothing
    // to go stale between here and the server.
    request: payable.isPartial
      ? { cartItemIds: payable.items.map((item) => item.id) }
      : {},
  }
}

function CheckoutForm({
  payable,
  onDone,
  onFailed,
}: {
  payable: Payable
  onDone: (result: CheckoutResult) => void
  /**
   * Reported upward rather than drawn here — see `CartCheckout`. This
   * component is one of the things a refusal can take off the screen, so it
   * cannot be the one holding the explanation.
   */
  onFailed: (error: unknown) => void
}) {
  const queryClient = useQueryClient()
  const [method, setMethod] = useState<PaymentMethod>("CARD")

  /*
   * CART-004 — the saved address the inputs below start from.
   *
   * Same key as the profile screen's own query, so arriving here from
   * `/profile` reads the copy that screen already has rather than asking
   * again, and saving there is seen here without a refetch.
   *
   * `retry: false` because the only likely failure is a 401, which trying
   * again does not fix.
   */
  const profile = useQuery({
    queryKey: myProfileQueryKey,
    queryFn: getMyProfile,
    retry: false,
  })

  const address = profileAddressDefaults(profile.data)
  const summary = summarise(payable)

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
          ...summary.request,
        }),
        wait(MIN_PROCESSING_MS),
      ])

      return result
    },
    onSuccess: (result) => {
      // Checkout empties the cart server-side; without this the header badge
      // would keep the old count until something else happened to refetch.
      void queryClient.invalidateQueries({ queryKey: cartQueryKey })

      // And this is the moment the buyer's order list stopped being true.
      // `/orders` has no socket wired to it, so nothing else tells it that an
      // order now exists — it was only ever right because React Query's
      // default `staleTime: 0` refetched it on arrival. Saying so explicitly
      // is what the list actually needs, and it is what keeps a non-zero
      // staleTime from showing a buyer a list without the order they just
      // paid for.
      void queryClient.invalidateQueries({ queryKey: ordersQueryKey })

      onDone(result)
    },
    onError: (error) => {
      onFailed(error)

      // The refusal is itself the news that this cart is out of date — the
      // stock it was priced against is gone. Without this, "กลับไปที่ตะกร้า"
      // lands on a cart that still looks fine, and the buyer is told the item
      // sold out on one screen and that all is well on the next.
      //
      // Refetching is enough: the cart route recomputes `issue` per line, so
      // the red "ของเหลือไม่พอ" row appears on arrival rather than after
      // whatever would eventually have refetched it.
      if (checkoutFailure(error).kind === "UNAVAILABLE") {
        void queryClient.invalidateQueries({ queryKey: cartQueryKey })
      }
    },
  })

  /*
   * Below every hook, so none of them is skipped on the pending render.
   *
   * Waiting at all is not a nicety: the inputs are uncontrolled, so a
   * `defaultValue` only counts on their first render. If the profile landed
   * after that, the saved address would never appear, and the feature would
   * work or not work depending on how fast the network happened to be.
   *
   * `isPending` rather than `isSuccess`, deliberately — a profile that cannot
   * be loaded must never stop anyone from paying. On error this falls straight
   * through to a blank form, which is the form that existed before this.
   */
  if (profile.isPending) {
    return (
      <div
        className="h-96 rounded-r4 bg-white shadow-sh1 motion-safe:animate-pulse"
        aria-hidden="true"
      />
    )
  }

  return (
    <>
      {/* Above the form rather than replacing it. The address is in
          uncontrolled inputs, so unmounting to show a result would throw away
          everything the buyer typed — and "try again" would mean typing it all
          a second time.
          The failure screen is drawn by the caller for a related reason: this
          component does not always survive its own refusals. */}
      {pay.isPending && <ProcessingOverlay />}

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

          {/* Every box starts from the address saved on the profile, and every
              one of them can still be typed over — this parcel may not be
              going where the last one went. */}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field
              name="recipientName"
              label="ชื่อผู้รับ"
              maxLength={150}
              defaultValue={address.recipientName}
              className="sm:col-span-2"
            />
            <Field
              name="line1"
              label="ที่อยู่"
              maxLength={200}
              defaultValue={address.line1}
              className="sm:col-span-2"
            />
            <Field
              name="line2"
              label="ที่อยู่เพิ่มเติม"
              maxLength={200}
              defaultValue={address.line2}
              optional
              className="sm:col-span-2"
            />
            <Field
              name="city"
              label="จังหวัด / เขต"
              maxLength={100}
              defaultValue={address.city}
            />
            <Field
              name="postalCode"
              label="รหัสไปรษณีย์"
              maxLength={20}
              defaultValue={address.postalCode}
            />
            <Field
              name="phone"
              label="เบอร์โทรศัพท์"
              maxLength={30}
              type="tel"
              defaultValue={address.phone}
              className="sm:col-span-2"
            />
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

        {/* Named on this side only. A cart is a stack of things the buyer just
            picked out and still remembers; a lot is one item won some time ago,
            possibly among several, and "1 ชิ้น" alone would not say which. */}
        {summary.lotTitle && (
          <p className="mt-3 line-clamp-2 font-semibold text-ink">
            {summary.lotTitle}
          </p>
        )}

        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-n-600">จำนวนสินค้า</dt>
            <dd className="font-semibold text-ink">{summary.itemCount} ชิ้น</dd>
          </div>
          {Number(summary.discountTotal) > 0 && (
            <div className="flex justify-between">
              <dt className="text-n-600">ส่วนลด</dt>
              <dd className="font-semibold text-green">
                −{formatTHB(summary.discountTotal)}
              </dd>
            </div>
          )}
        </dl>

        <div className="mt-4 flex items-baseline justify-between border-t border-n-200 pt-4">
          <span className="font-semibold text-ink">ยอดที่ต้องชำระ</span>
          <span className="font-display text-2xl font-extrabold text-ink">
            {formatTHB(summary.total)}
          </span>
        </div>

        {/* CART-003 — the split is decided by what is being paid for, not by
            this form */}
        {summary.sellerCount > 1 && (
          <p className="mt-3 rounded-r3 bg-n-100 px-3 py-2 text-xs text-n-600">
            จ่ายครั้งเดียว แล้วระบบจะแยกเป็น {summary.sellerCount} คำสั่งซื้อ
            ตามร้าน
          </p>
        )}

        {/* The buyer chose this on the previous screen, but the address form
            is long enough that it is worth repeating what is not in it. */}
        {payable.kind === "CART" && payable.isPartial && (
          <p className="mt-3 rounded-r3 bg-amber-50 px-3 py-2 text-xs text-ink">
            ชำระเฉพาะ {payable.items.length} รายการที่เลือกไว้ —
            รายการที่เหลือจะยังอยู่ในตะกร้า
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

        {/* Back to wherever this came from. A winner has no cart to edit, and
            sending them to one would be a dead end. */}
        <Button
          variant="ghost"
          size="sm"
          block
          className="mt-2"
          nativeButton={false}
          render={
            <Link
              href={
                payable.kind === "AUCTION"
                  ? `/auctions/${payable.auctionId}`
                  : "/cart"
              }
            />
          }
        >
          {payable.kind === "AUCTION" ? "กลับไปหน้าประมูล" : "กลับไปแก้ตะกร้า"}
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

function Field({
  name,
  label,
  maxLength,
  optional,
  type = "text",
  defaultValue,
  className,
}: {
  name: string
  label: string
  maxLength: number
  optional?: boolean
  type?: string
  /**
   * The saved address, if there is one. `defaultValue` and not `value`: the
   * box stays uncontrolled, so this is a starting point the buyer types over
   * rather than a value that fights them for the field.
   */
  defaultValue?: string
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
        defaultValue={defaultValue}
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
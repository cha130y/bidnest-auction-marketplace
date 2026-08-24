"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { Check, Truck } from "lucide-react"

import {
  OrderStatusBadge,
  SHIPMENT_LABELS,
} from "@/components/order/order-status-badge"
import { ProductImage } from "@/components/shop/product-image"
import { Button } from "@/components/ui/button"
import { useAuthToken } from "@/lib/api/auth/use-auth-token"
import { loginHref } from "@/lib/api/auth/login-redirect"
import { ApiError } from "@/lib/api/client"
import { getOrder, getShipment } from "@/lib/api/orders"
import { formatDateTime, formatTHB } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Order, ShipmentTimeline } from "@/lib/api/types"

/** SHIP-003 / SHIP-002 — one order, and where its parcel has got to. */
export function OrderDetail({ orderId }: { orderId: string }) {
  const { token, ready } = useAuthToken()
  const isAuthenticated = ready && Boolean(token)

  const order = useQuery({
    queryKey: ["orders", orderId],
    queryFn: () => getOrder(orderId),
    enabled: isAuthenticated,
    retry: false,
  })

  if (!ready || (isAuthenticated && order.isLoading)) {
    return (
      <div
        className="h-96 rounded-r4 bg-white shadow-sh1 motion-safe:animate-pulse"
        aria-hidden="true"
      />
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="rounded-r4 bg-white px-6 py-16 text-center shadow-sh1">
        <h2 className="font-display text-xl font-bold text-ink">
          เข้าสู่ระบบเพื่อดูคำสั่งซื้อนี้
        </h2>
        <div className="mt-6 flex justify-center">
          <Button variant="primary" size="lg" nativeButton={false} render={<Link href={loginHref()} />}>
            เข้าสู่ระบบ
          </Button>
        </div>
      </div>
    )
  }

  if (order.error || !order.data) {
    return (
      <div className="rounded-r4 border border-red bg-red-50 px-6 py-12 text-center">
        <p className="font-semibold text-red">
          {order.error instanceof ApiError
            ? order.error.message
            : "ไม่พบคำสั่งซื้อนี้"}
        </p>
        <div className="mt-6 flex justify-center">
          <Button variant="secondary" size="md" nativeButton={false} render={<Link href="/orders" />}>
            กลับไปที่รายการคำสั่งซื้อ
          </Button>
        </div>
      </div>
    )
  }

  return <Loaded order={order.data} isAuthenticated={isAuthenticated} />
}

function Loaded({
  order,
  isAuthenticated,
}: {
  order: Order
  isAuthenticated: boolean
}) {
  const shipment = useQuery({
    queryKey: ["orders", order.id, "shipment"],
    queryFn: () => getShipment(order.id),
    // A cancelled order has no parcel to follow, and an unpaid one has nothing
    // to pack yet — asking would only produce an error to swallow.
    enabled: isAuthenticated && order.status === "PAID",
    retry: false,
  })

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
      <div className="space-y-6">
        <section className="rounded-r4 bg-white p-6 shadow-sh1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <OrderStatusBadge status={order.status} />
            <span className="text-sm text-n-500">
              สั่งเมื่อ {formatDateTime(order.createdAt)}
            </span>
          </div>

          <ul className="mt-4 divide-y divide-n-200">
            {order.items.map((item) => (
              <li key={item.id} className="flex gap-4 py-4 first:pt-0 last:pb-0">
                <Link href={`/shop/${item.product.id}`} className="shrink-0">
                  <ProductImage
                    src={item.product.imageUrl}
                    alt={item.product.title}
                    className="size-20 rounded-r3 object-cover"
                  />
                </Link>
                <div className="flex min-w-0 flex-1 flex-col">
                  <Link
                    href={`/shop/${item.product.id}`}
                    className="line-clamp-2 font-semibold text-ink transition-colors hover:text-amber-600"
                  >
                    {item.product.title}
                  </Link>
                  <span className="text-sm text-n-500">
                    {formatTHB(item.unitPrice)} × {item.quantity}
                  </span>
                </div>
                <span className="font-display font-bold text-ink">
                  {formatTHB(item.lineTotal)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {order.status === "PAID" && (
          <ShipmentPanel
            timeline={shipment.data}
            isLoading={shipment.isLoading}
          />
        )}
      </div>

      <aside className="space-y-6 lg:sticky lg:top-6">
        <section className="rounded-r4 bg-white p-6 shadow-sh1">
          <h2 className="font-display text-lg font-bold text-ink">ยอดรวม</h2>
          <p className="mt-2 font-display text-2xl font-extrabold text-ink">
            {formatTHB(order.subtotal)}
          </p>
          <p className="mt-3 text-xs text-n-500">
            ร้าน {order.seller.displayName ?? "ไม่ระบุชื่อ"}
          </p>
        </section>

        {order.shippingAddress && (
          <section className="rounded-r4 bg-white p-6 shadow-sh1">
            <h2 className="font-display text-lg font-bold text-ink">
              ที่อยู่จัดส่ง
            </h2>
            <address className="mt-3 space-y-0.5 text-sm not-italic text-n-600">
              <p className="font-semibold text-ink">
                {order.shippingAddress.recipientName}
              </p>
              <p>{order.shippingAddress.line1}</p>
              {order.shippingAddress.line2 && (
                <p>{order.shippingAddress.line2}</p>
              )}
              <p>
                {order.shippingAddress.city} {order.shippingAddress.postalCode}
              </p>
              <p>{order.shippingAddress.phone}</p>
            </address>
          </section>
        )}

        <Button variant="ghost" size="sm" block nativeButton={false} render={<Link href="/orders" />}>
          กลับไปที่รายการคำสั่งซื้อ
        </Button>
      </aside>
    </div>
  )
}

/** SHIP-002 — the steps the parcel has passed, and the one it is on. */
function ShipmentPanel({
  timeline,
  isLoading,
}: {
  timeline: ShipmentTimeline | undefined
  isLoading: boolean
}) {
  if (isLoading) {
    return (
      <div
        className="h-40 rounded-r4 bg-white shadow-sh1 motion-safe:animate-pulse"
        aria-hidden="true"
      />
    )
  }

  if (!timeline) return null

  return (
    <section className="rounded-r4 bg-white p-6 shadow-sh1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-ink">
          <Truck className="size-5" aria-hidden="true" />
          การจัดส่ง
        </h2>
        {/* SRS §6 — while the shipment is simulated, say so rather than let it
            read as a real courier update. */}
        {timeline.isSimulated && (
          <span className="rounded-full bg-n-100 px-3 py-1 text-xs font-semibold text-n-600">
            จำลอง
          </span>
        )}
      </div>

      {timeline.trackingNumber && (
        <p className="mt-2 text-sm text-n-600">
          {timeline.carrier ?? "ขนส่ง"} ·{" "}
          <span className="font-mono text-ink">{timeline.trackingNumber}</span>
        </p>
      )}

      <ol className="mt-4 space-y-3">
        {timeline.timeline.map((step, index) => {
          const isCurrent = index === timeline.timeline.length - 1

          return (
            <li key={`${step.status}-${step.at}`} className="flex gap-3">
              <span
                className={cn(
                  "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full",
                  isCurrent ? "bg-amber-500 text-ink" : "bg-green-50 text-green"
                )}
                aria-hidden="true"
              >
                <Check className="size-3.5" />
              </span>
              <div>
                <p
                  className={cn(
                    "font-semibold",
                    isCurrent ? "text-ink" : "text-n-600"
                  )}
                >
                  {SHIPMENT_LABELS[step.status]}
                </p>
                <p className="text-xs text-n-500">{formatDateTime(step.at)}</p>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
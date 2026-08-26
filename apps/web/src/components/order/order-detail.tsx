"use client"

import { useCallback } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowRight } from "lucide-react"

import { OrderStatusBadge } from "@/components/order/order-status-badge"
import { ShipmentPanel } from "@/components/order/shipment-panel"
import { ProductImage } from "@/components/shop/product-image"
import { Button } from "@/components/ui/button"
import { useAuthToken } from "@/lib/api/auth/use-auth-token"
import { loginHref } from "@/lib/api/auth/login-redirect"
import { ApiError } from "@/lib/api/client"
import { getOrder, getShipment } from "@/lib/api/orders"
import { formatDateTime, formatTHB } from "@/lib/format"
import { useUserChannel } from "@/lib/use-user-channel"
import type { Order } from "@/lib/api/types"

/** SHIP-003 / SHIP-002 — one order, and where its parcel has got to. */
export function OrderDetail({ orderId }: { orderId: string }) {
  const queryClient = useQueryClient()
  const { token, ready } = useAuthToken()
  const isAuthenticated = ready && Boolean(token)

  // Wrapped because `useUserChannel` holds it in an effect dependency — an
  // inline function would tear the socket down and rebuild it every render.
  const reread = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["orders", orderId] })
  }, [queryClient, orderId])

  /**
   * SHIP-001 is the seller's action, but this is the screen that has to show
   * it. The server emits `order:status_changed` to both parties after commit,
   * so the moment the seller advances the parcel this page re-reads — no
   * polling, and no stale timeline sitting there until somebody refreshes.
   */
  useUserChannel(token, reread)

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
            actions={<WhatHappensNext order={order} />}
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

/**
 * What to do once the parcel is on screen — which, on this page, is usually
 * nothing, and saying so is the point.
 *
 * SHIP-001 belongs to the seller, so this screen carries no controls. That
 * left the timeline sitting at "กำลังเตรียมพัสดุ" with nothing underneath it
 * and no hint of who moves it next. Two different readers reach that dead end:
 *
 * - **The seller**, who arrives from a notification, or from their own shop,
 *   and lands on the buyer's view of their own sale. `GET /orders/:id` answers
 *   for them too (SHIP-003), so the page renders perfectly and does nothing.
 *   They get the way across to `/sell/orders/[id]`, where the controls are.
 * - **The buyer**, who genuinely has nothing to press and should be told that
 *   rather than left hunting for a button — including that the page moves on
 *   its own, since `useUserChannel` above means it really does.
 *
 * Always renders something: `ShipmentPanel` draws a divider above whatever it
 * is handed, and a divider over empty space is worse than no divider.
 */
function WhatHappensNext({ order }: { order: Order }) {
  const { data: session } = useSession()

  if (session?.user?.id === order.seller.id) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-n-600">
          คำสั่งซื้อนี้เป็นของร้านคุณ
        </p>
        <Button
          variant="primary"
          size="md"
          nativeButton={false}
          render={<Link href={`/sell/orders/${order.id}`} />}
        >
          จัดการการจัดส่ง
          <ArrowRight />
        </Button>
      </div>
    )
  }

  return (
    <p className="text-sm text-n-600">
      {order.shipment?.status === "DELIVERED"
        ? "จัดส่งสำเร็จแล้ว ขอบคุณที่สั่งซื้อ"
        : "ผู้ขายกำลังดำเนินการ — หน้านี้จะอัปเดตเองเมื่อสถานะเปลี่ยน ไม่ต้องรีเฟรช"}
    </p>
  )
}

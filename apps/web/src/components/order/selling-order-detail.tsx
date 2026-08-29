"use client"

import { useCallback } from "react"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { OrderLineRow } from "@/components/order/order-line-row"
import { OrderStatusBadge } from "@/components/order/order-status-badge"
import { ShipmentControls } from "@/components/order/shipment-controls"
import { ShipmentPanel } from "@/components/order/shipment-panel"
import { Button } from "@/components/ui/button"
import { useAuthToken } from "@/lib/api/auth/use-auth-token"
import { ApiError } from "@/lib/api/client"
import { getOrder, getShipment } from "@/lib/api/orders"
import { formatDateTime, formatTHB } from "@/lib/format"
import { useUserChannel } from "@/lib/use-user-channel"
import type { Order } from "@/lib/api/types"

/** SHIP-001 — one sold order, and the controls that move its parcel. */
export function SellingOrderDetail({ orderId }: { orderId: string }) {
  const queryClient = useQueryClient()
  const { token } = useAuthToken()

  // Wrapped because `useUserChannel` holds it in an effect dependency — an
  // inline function would tear the socket down and rebuild it every render.
  const reread = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["orders", orderId] })
  }, [queryClient, orderId])

  // The server emits `order:status_changed` to both parties after commit, so a
  // second tab — or the buyer acting on something — lands here too.
  useUserChannel(token, reread)

  const order = useQuery({
    queryKey: ["orders", orderId],
    queryFn: () => getOrder(orderId),
    retry: false,
  })

  if (order.isLoading) {
    return (
      <div
        className="h-96 rounded-r4 bg-white shadow-sh1 motion-safe:animate-pulse"
        aria-hidden="true"
      />
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
          <Button
            variant="secondary"
            size="md"
            nativeButton={false}
            render={<Link href="/sell/orders" />}
          >
            กลับไปที่รายการ
          </Button>
        </div>
      </div>
    )
  }

  return <Loaded order={order.data} />
}

function Loaded({ order }: { order: Order }) {
  const shipment = useQuery({
    queryKey: ["orders", order.id, "shipment"],
    queryFn: () => getShipment(order.id),
    // A cancelled order has no parcel left to move, and an unpaid one has
    // nothing packed yet — asking would only produce an error to swallow.
    enabled: order.status === "PAID",
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
              <OrderLineRow key={item.id} item={item} />
            ))}
          </ul>
        </section>

        {order.status === "PAID" && (
          <ShipmentPanel
            timeline={shipment.data}
            isLoading={shipment.isLoading}
            actions={
              shipment.data && (
                <ShipmentControls
                  orderId={order.id}
                  nextStatuses={shipment.data.nextStatuses}
                />
              )
            }
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
            ผู้ซื้อ {order.buyer.displayName ?? "ไม่ระบุชื่อ"}
          </p>
        </section>

        {order.shippingAddress && (
          <section className="rounded-r4 bg-white p-6 shadow-sh1">
            <h2 className="font-display text-lg font-bold text-ink">
              ที่อยู่จัดส่ง
            </h2>
            <address className="mt-3 space-y-0.5 text-sm text-n-600 not-italic">
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

        <Button
          variant="ghost"
          size="sm"
          block
          nativeButton={false}
          render={<Link href="/sell/orders" />}
        >
          กลับไปที่รายการ
        </Button>
      </aside>
    </div>
  )
}

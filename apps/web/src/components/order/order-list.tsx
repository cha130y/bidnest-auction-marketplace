"use client"

import { useState } from "react"
import Link from "next/link"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Package } from "lucide-react"

import { OrderStatusBadge, SHIPMENT_LABELS } from "@/components/order/order-status-badge"
import { ProductImage } from "@/components/shop/product-image"
import { Button } from "@/components/ui/button"
import { PageNav } from "@/components/ui/page-nav"
import { useAuthToken } from "@/lib/api/auth/use-auth-token"
import { loginHref } from "@/lib/api/auth/login-redirect"
import { listOrders } from "@/lib/api/orders"
import { formatDateTime, formatTHB } from "@/lib/format"
import type { Order } from "@/lib/api/types"

export const ordersQueryKey = ["orders", "buying"] as const

const PAGE_SIZE = 10

/**
 * SHIP-003 — what the viewer has bought, newest first.
 *
 * One payment can have produced several orders (CART-003), so these are listed
 * per order rather than per payment: each has its own seller, its own parcel,
 * and its own status to follow.
 */
export function OrderList() {
  const { token, ready } = useAuthToken()
  const isAuthenticated = ready && Boolean(token)
  const [page, setPage] = useState(1)

  const { data, isPending } = useQuery({
    // The page is part of the key, so going back to one is served from cache
    queryKey: [...ordersQueryKey, page],
    queryFn: () => listOrders({ page, limit: PAGE_SIZE }),
    enabled: isAuthenticated,
    // Hold the rows already on screen while the next page is fetched, rather
    // than dropping to the skeleton and back for every press of the pager.
    placeholderData: keepPreviousData,
    // A 401 will not fix itself by trying again
    retry: false,
  })

  // `isPending`, not `isLoading`: the latter is false on the render where the
  // query has only just been enabled, which let "ยังไม่มีคำสั่งซื้อ" flash at
  // somebody whose orders were still on their way.
  if (!ready || (isAuthenticated && isPending)) {
    return (
      <div
        className="h-64 rounded-r4 bg-white shadow-sh1 motion-safe:animate-pulse"
        aria-hidden="true"
      />
    )
  }

  if (!isAuthenticated) {
    return (
      <Empty title="เข้าสู่ระบบเพื่อดูคำสั่งซื้อ">
        <Button variant="primary" size="lg" nativeButton={false} render={<Link href={loginHref()} />}>
          เข้าสู่ระบบ
        </Button>
      </Empty>
    )
  }

  if (!data || data.items.length === 0) {
    return (
      <Empty title="ยังไม่มีคำสั่งซื้อ">
        <Button variant="primary" size="lg" nativeButton={false} render={<Link href="/shop" />}>
          ไปเลือกสินค้า
        </Button>
      </Empty>
    )
  }

  return (
    <>
      <ul className="space-y-4">
        {data.items.map((order) => (
          <OrderRow key={order.id} order={order} />
        ))}
      </ul>

      {/* The local `page`, not `data.meta.page`. Under `keepPreviousData`
          `data` is still the previous page's while the next one is in flight,
          so highlighting from it left the pressed number un-highlighted until
          the response landed — the rows do not move either, so the press
          looked like it had done nothing at all. */}
      <PageNav
        page={page}
        totalPages={data.meta.totalPages}
        onChange={setPage}
      />
    </>
  )
}

function Empty({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-r4 bg-white px-6 py-16 text-center shadow-sh1">
      <Package className="mx-auto size-10 text-n-300" aria-hidden="true" />
      <h2 className="mt-4 font-display text-xl font-bold text-ink">{title}</h2>
      <div className="mt-6 flex justify-center">{children}</div>
    </div>
  )
}

function OrderRow({ order }: { order: Order }) {
  const totalItems = order.items.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <li>
      <Link
        href={`/orders/${order.id}`}
        className="block rounded-r4 bg-white p-4 shadow-sh1 transition-shadow hover:shadow-sh2"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <OrderStatusBadge status={order.status} />
            {order.shipment && (
              <span className="text-xs text-n-500">
                {SHIPMENT_LABELS[order.shipment.status]}
              </span>
            )}
          </div>
          <span className="text-xs text-n-500">
            {formatDateTime(order.createdAt)}
          </span>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <div className="flex -space-x-3">
            {/* A strip of what is in it, capped so a big order does not push
                the price off the row. */}
            {order.items.slice(0, 3).map((item) => (
              <ProductImage
                key={item.id}
                src={item.listing?.imageUrl ?? null}
                alt={item.listing?.title ?? ""}
                className="size-14 rounded-r3 border-2 border-white object-cover"
              />
            ))}
          </div>

          <div className="min-w-0 flex-1">
            <p className="line-clamp-1 font-semibold text-ink">
              {order.items[0]?.listing?.title ?? "—"}
              {order.items.length > 1 && (
                <span className="font-normal text-n-500">
                  {" "}
                  และอีก {order.items.length - 1} รายการ
                </span>
              )}
            </p>
            <p className="text-xs text-n-500">
              {totalItems} ชิ้น · ร้าน {order.seller.displayName ?? "ไม่ระบุชื่อ"}
            </p>
          </div>

          <span className="font-display text-lg font-bold text-ink">
            {formatTHB(order.subtotal)}
          </span>
        </div>
      </Link>
    </li>
  )
}
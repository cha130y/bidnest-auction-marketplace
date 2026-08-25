"use client"

import { useState } from "react"
import Link from "next/link"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Package } from "lucide-react"

import {
  OrderStatusBadge,
  SHIPMENT_LABELS,
} from "@/components/order/order-status-badge"
import { ProductImage } from "@/components/shop/product-image"
import { Button } from "@/components/ui/button"
import { PageNav } from "@/components/ui/page-nav"
import { listSellingOrders } from "@/lib/api/orders"
import { formatDateTime, formatTHB } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Order, ShipmentStatus } from "@/lib/api/types"

export const sellingOrdersQueryKey = ["orders", "selling"] as const

const PAGE_SIZE = 10

/**
 * The groups a seller actually thinks in, which are not the five states the
 * sequence is written in. "กำลังส่ง" is two of them, and "รอจัดส่ง" is the one
 * that means work — everything under it is waiting on this seller to press
 * something.
 *
 * Filtered on the server rather than over the rows already fetched: with a
 * pager, filtering here would only ever narrow the ten rows on screen and
 * quietly hide the rest of the matches.
 */
const GROUPS: { key: string; label: string; statuses?: ShipmentStatus[] }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "todo", label: "รอจัดส่ง", statuses: ["PROCESSING"] },
  { key: "moving", label: "กำลังส่ง", statuses: ["SHIPPED", "IN_TRANSIT"] },
  { key: "done", label: "เสร็จแล้ว", statuses: ["DELIVERED", "CANCELLED"] },
]

/**
 * SHIP-001/SHIP-003 — what this seller has sold, and which parcels are waiting
 * on them.
 *
 * The shipment status comes off the order rows themselves rather than from
 * `GET /orders/:id/shipment`: the list only has to *say* where each parcel is,
 * and fetching a timeline per row would be one request per order to render a
 * single word. The timeline — and the controls — belong to the one order the
 * seller opens.
 */
export function SellingOrderList() {
  const [group, setGroup] = useState("all")
  const [page, setPage] = useState(1)
  const statuses = GROUPS.find((entry) => entry.key === group)?.statuses

  const { data, isLoading } = useQuery({
    queryKey: [...sellingOrdersQueryKey, group, page],
    queryFn: () =>
      listSellingOrders({
        page,
        limit: PAGE_SIZE,
        ...(statuses ? { shipmentStatus: statuses } : {}),
      }),
    // Hold the rows already on screen while the next page is fetched, rather
    // than dropping to the skeleton and back for every press of the pager.
    placeholderData: keepPreviousData,
    // A 401 will not fix itself by trying again
    retry: false,
  })

  const tabs = (
    <div className="mb-4 flex flex-wrap items-center gap-1.5 rounded-full bg-n-100 p-1.5">
      {GROUPS.map((entry) => (
        <button
          key={entry.key}
          type="button"
          aria-pressed={entry.key === group}
          onClick={() => {
            setGroup(entry.key)
            // Page four of "ทั้งหมด" is rarely page four of "รอจัดส่ง", and is
            // often past its end — which would answer with nothing at all.
            setPage(1)
          }}
          className={cn(
            "inline-flex h-9 items-center rounded-full px-4 text-sm font-semibold transition-all outline-none focus-visible:ring-3 focus-visible:ring-amber-500/30",
            entry.key === group
              ? "bg-white text-ink shadow-sh1"
              : "text-n-500 hover:text-ink"
          )}
        >
          {entry.label}
        </button>
      ))}
    </div>
  )

  if (isLoading) {
    return (
      <div
        className="h-64 rounded-r4 bg-white shadow-sh1 motion-safe:animate-pulse"
        aria-hidden="true"
      />
    )
  }

  if (!data || data.items.length === 0) {
    return (
      <>
        {tabs}
        <div className="rounded-r4 bg-white px-6 py-16 text-center shadow-sh1">
          <Package className="mx-auto size-10 text-n-300" aria-hidden="true" />
          <h2 className="mt-4 font-display text-xl font-bold text-ink">
            {group === "all"
              ? "ยังไม่มีคำสั่งซื้อเข้ามา"
              : "ไม่มีคำสั่งซื้อในกลุ่มนี้"}
          </h2>
          {group === "all" && (
            <>
              <p className="mt-2 text-base text-n-600">
                เมื่อมีคนซื้อสินค้าของคุณ คำสั่งซื้อจะมาอยู่ที่นี่
              </p>
              <div className="mt-6 flex justify-center">
                <Button
                  variant="secondary"
                  size="md"
                  nativeButton={false}
                  render={<Link href="/sell/products" />}
                >
                  ดูสินค้าของฉัน
                </Button>
              </div>
            </>
          )}
        </div>
      </>
    )
  }

  return (
    <>
      {tabs}
      <ul className="space-y-4">
        {data.items.map((order) => (
          <SellingOrderRow key={order.id} order={order} />
        ))}
      </ul>

      <PageNav
        page={data.meta.page}
        totalPages={data.meta.totalPages}
        onChange={setPage}
      />
    </>
  )
}

/** Paid, and the parcel has not finished its journey — the seller's move. */
function needsAction(order: Order): boolean {
  if (order.status !== "PAID") return false
  const status = order.shipment?.status
  return status !== undefined && status !== "DELIVERED" && status !== "CANCELLED"
}

function SellingOrderRow({ order }: { order: Order }) {
  const totalItems = order.items.reduce((sum, item) => sum + item.quantity, 0)
  const waiting = needsAction(order)

  return (
    <li>
      <Link
        href={`/sell/orders/${order.id}`}
        className={
          waiting
            ? "block rounded-r4 border-2 border-amber-400 bg-white p-4 shadow-sh1 transition-shadow hover:shadow-sh2"
            : "block rounded-r4 bg-white p-4 shadow-sh1 transition-shadow hover:shadow-sh2"
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <OrderStatusBadge status={order.status} />
            {order.shipment && (
              <span className="text-xs text-n-500">
                {SHIPMENT_LABELS[order.shipment.status]}
              </span>
            )}
            {waiting && (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-600">
                รอคุณดำเนินการ
              </span>
            )}
          </div>
          <span className="text-xs text-n-500">
            {formatDateTime(order.createdAt)}
          </span>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <div className="flex -space-x-3">
            {order.items.slice(0, 3).map((item) => (
              <ProductImage
                key={item.id}
                src={item.product.imageUrl}
                alt={item.product.title}
                className="size-14 rounded-r3 border-2 border-white object-cover"
              />
            ))}
          </div>

          <div className="min-w-0 flex-1">
            <p className="line-clamp-1 font-semibold text-ink">
              {order.items[0]?.product.title ?? "—"}
              {order.items.length > 1 && (
                <span className="font-normal text-n-500">
                  {" "}
                  และอีก {order.items.length - 1} รายการ
                </span>
              )}
            </p>
            <p className="text-xs text-n-500">
              {totalItems} ชิ้น · ผู้ซื้อ{" "}
              {order.buyer.displayName ?? "ไม่ระบุชื่อ"}
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

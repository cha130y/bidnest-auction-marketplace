"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { ProductCard } from "@/components/shop/product-card"
import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api/client"
import { loginHref } from "@/lib/api/auth/login-redirect"
import { useAuthToken } from "@/lib/api/auth/use-auth-token"
import { listProductWatchlist } from "@/lib/api/product-watchlist"
import type { Paginated, ProductWatchlistEntry } from "@/lib/api/types"

/**
 * The listings somebody is following — the shop's twin of `WatchlistView`.
 *
 * A Client Component, and not by preference: the access token lives in
 * localStorage, so `authHeader()` is empty during SSR and a server-rendered
 * version would 401 for everybody.
 *
 * Nothing is rendered as an answer until `ready` — the flag exists so the page
 * does not flash "please sign in" at somebody who is signed in, in the moment
 * before localStorage has been read.
 */
export function ProductWatchlistView() {
  const router = useRouter()
  const { token, ready } = useAuthToken()
  const [page, setPage] = useState<Paginated<ProductWatchlistEntry> | null>(
    null
  )
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    if (!ready || !token) return

    let cancelled = false

    listProductWatchlist({ limit: 24 })
      .then((result) => {
        if (!cancelled) setPage(result)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught)
      })

    return () => {
      cancelled = true
    }
  }, [ready, token])

  if (!ready) return <Skeleton />

  if (!token) {
    return (
      <div className="rounded-r4 bg-white px-6 py-16 text-center shadow-sh1">
        <p className="text-n-600">เข้าสู่ระบบเพื่อดูสินค้าที่คุณติดตามไว้</p>
        <Button
          variant="primary"
          size="lg"
          className="mt-4"
          // Reads `window.location` to build the callback, so it runs on click
          // rather than during render.
          onClick={() => router.push(loginHref())}
        >
          เข้าสู่ระบบ
        </Button>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-r4 border border-red bg-red-50 px-6 py-8 text-center">
        <p className="font-semibold text-red">
          {error instanceof ApiError
            ? error.message
            : "โหลดสินค้าที่ติดตามไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"}
        </p>
      </div>
    )
  }

  if (!page) return <Skeleton />

  if (page.items.length === 0) {
    return (
      <p className="rounded-r4 bg-white px-6 py-16 text-center text-n-500 shadow-sh1">
        ยังไม่ได้ติดตามสินค้าใด กดหัวใจบนหน้าสินค้าเพื่อเก็บไว้ที่นี่
      </p>
    )
  }

  return (
    <>
      <p className="text-sm text-n-600">
        ติดตามอยู่ {page.meta.total.toLocaleString("th-TH")} รายการ
      </p>
      <div className="mt-4 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {page.items.map((entry) => (
          <ProductCard key={entry.product.id} product={entry.product} />
        ))}
      </div>
    </>
  )
}

function Skeleton() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          className="overflow-hidden rounded-r4 bg-white shadow-sh1"
        >
          <div className="aspect-square w-full bg-n-100 motion-safe:animate-pulse" />
          <div className="flex flex-col gap-2 p-4">
            <div className="h-3 w-1/3 rounded-full bg-n-100 motion-safe:animate-pulse" />
            <div className="h-4 w-4/5 rounded-full bg-n-100 motion-safe:animate-pulse" />
            <div className="mt-3 h-5 w-2/5 rounded-full bg-n-100 motion-safe:animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  )
}
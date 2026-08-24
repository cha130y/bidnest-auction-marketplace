import Link from "next/link"

import { ProductCard } from "@/components/shop/product-card"
import { searchProducts } from "@/lib/api/products"
import { ApiError } from "@/lib/api/client"
import { shuffle } from "@/lib/random"

const POOL_SIZE = 20
const PICK_COUNT = 5

/**
 * Home page, bottom half. No "best seller" ranking exists yet — that would
 * mean summing `OrderItem.quantity` across paid orders, which is e-commerce
 * (Dev 3) backend work nobody has built — so this picks 5 at random from the
 * newest active listings instead. Reshuffles on every request because the
 * page renders `force-dynamic`.
 */
export async function HomeProductPicksSection() {
  let products: Awaited<ReturnType<typeof searchProducts>>["items"] = []
  let error: unknown

  try {
    const page = await searchProducts({ limit: POOL_SIZE })
    products = shuffle(page.items).slice(0, PICK_COUNT)
  } catch (caught) {
    error = caught
  }

  return (
    <section className="py-4">
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <div>
          <h2 className="font-display text-xl font-bold text-ink">
            สินค้าแนะนำ
          </h2>
          <p className="mt-1 text-sm text-n-500">หยิบมาให้ลองดู</p>
        </div>
        <Link
          href="/shop"
          className="shrink-0 text-sm font-semibold text-amber-600 transition-colors hover:text-ink"
        >
          ดูทั้งหมด
        </Link>
      </div>

      {error !== undefined ? (
        <p className="rounded-r4 border border-red bg-red-50 px-6 py-8 text-center font-medium text-red">
          {error instanceof ApiError
            ? error.message
            : "โหลดรายการสินค้าไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"}
        </p>
      ) : products.length === 0 ? (
        <p className="rounded-r4 bg-white px-6 py-16 text-center text-n-500 shadow-sh1">
          ยังไม่มีสินค้าวางขาย
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </section>
  )
}

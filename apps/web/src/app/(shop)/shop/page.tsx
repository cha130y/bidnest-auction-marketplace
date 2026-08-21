import type { Metadata } from "next"

import { CatalogPagination } from "@/components/shop/catalog-pagination"
import { ProductCard } from "@/components/shop/product-card"
import { ProductFilters } from "@/components/shop/product-filters"
import { ProductSortSelect } from "@/components/shop/product-sort"
import { listCategories } from "@/lib/api/categories"
import { ApiError } from "@/lib/api/client"
import { searchProducts } from "@/lib/api/products"
import { CATALOG_PAGE_SIZE, parseShopSearch } from "@/lib/shop-search"
import type { CategoryTree, Paginated, Product } from "@/lib/api/types"

export const metadata: Metadata = {
  title: "สินค้าทั้งหมด · BidNest",
  description: "เลือกซื้อสินค้าจากผู้ขายที่ยืนยันตัวตนแล้วบน BidNest",
}

/**
 * PROD-003/004 — public catalog. A Server Component because `GET /products` is
 * `@Public()`: no bearer token is needed, so the list can be rendered on the
 * server and the only client JS on the page is the filter form and the
 * add-to-cart buttons.
 */
export default async function ShopPage({ searchParams }: PageProps<"/shop">) {
  const search = parseShopSearch(await searchParams)

  const [productsResult, categoriesResult] = await Promise.allSettled([
    searchProducts({
      q: search.q,
      categoryIds: search.categoryIds,
      minPrice: search.minPrice,
      maxPrice: search.maxPrice,
      sort: search.sort,
      page: search.page,
      limit: CATALOG_PAGE_SIZE,
    }),
    listCategories(),
  ])

  // Categories only drive the filter panel — losing them should not take the
  // catalog down with them
  const categories: CategoryTree[] =
    categoriesResult.status === "fulfilled" ? categoriesResult.value : []

  const products: Paginated<Product> | null =
    productsResult.status === "fulfilled" ? productsResult.value : null

  const error =
    productsResult.status === "rejected" ? productsResult.reason : null

  return (
    <div className="mx-auto w-full max-w-330 px-4 pb-16 md:px-6">
      <header className="py-8">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
          สินค้าทั้งหมด
        </h1>
        <p className="mt-2 text-base text-n-600">
          ซื้อได้ทันทีในราคาที่ผู้ขายตั้งไว้ ไม่ต้องรอปิดประมูล
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          {/* Re-seeds the inputs whenever the URL changes (clear, back button) */}
          <ProductFilters
            key={JSON.stringify(search)}
            search={search}
            categories={categories}
          />
        </aside>

        <section>
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-r4 bg-white px-5 py-4 shadow-sh1">
            <span className="text-sm text-n-600">
              {products
                ? `พบ ${products.meta.total.toLocaleString("th-TH")} รายการ`
                : "—"}
            </span>
            <ProductSortSelect search={search} />
          </div>

          {error && <CatalogError error={error} />}

          {products && products.items.length === 0 && (
            <p className="mt-6 rounded-r4 bg-white px-6 py-16 text-center text-n-500 shadow-sh1">
              ไม่พบสินค้าที่ตรงกับเงื่อนไข ลองล้างตัวกรองแล้วค้นหาใหม่
            </p>
          )}

          {products && products.items.length > 0 && (
            <>
              <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {products.items.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
              <CatalogPagination search={search} meta={products.meta} />
            </>
          )}
        </section>
      </div>
    </div>
  )
}

function CatalogError({ error }: { error: unknown }) {
  const message =
    error instanceof ApiError
      ? error.message
      : "โหลดรายการสินค้าไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"

  return (
    <div className="mt-6 rounded-r4 border border-red bg-red-50 px-6 py-8 text-center">
      <p className="font-semibold text-red">{message}</p>
      <p className="mt-2 text-sm text-n-600">
        ตรวจว่า API ที่ NEXT_PUBLIC_API_URL กำลังทำงานอยู่หรือไม่
      </p>
    </div>
  )
}

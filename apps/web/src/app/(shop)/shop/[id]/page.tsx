import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ChevronRight } from "lucide-react"

import { ProductGallery } from "@/components/shop/product-gallery"
import { ProductPurchasePanel } from "@/components/shop/product-purchase-panel"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ApiError } from "@/lib/api/client"
import { categoryLabel } from "@/lib/category-labels"
import { getProduct } from "@/lib/api/products"
import { formatDate } from "@/lib/format"
import type { OwnerProduct, ProductCondition } from "@/lib/api/types"

const CONDITION_LABEL: Record<ProductCondition, string> = {
  NEW: "ของใหม่",
  USED: "มือสอง",
}

/**
 * PROD-003 — public product detail. `GET /products/:id` is `@Public()`, so this
 * renders on the server; the request carries no token, which means the response
 * is the buyer-facing shape and `negotiationFloor` is never in it (SRS §6).
 */
async function loadProduct(id: string): Promise<OwnerProduct> {
  try {
    return await getProduct(id)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound()
    throw error
  }
}

export async function generateMetadata({
  params,
}: PageProps<"/shop/[id]">): Promise<Metadata> {
  const { id } = await params

  try {
    const product = await getProduct(id)
    return {
      title: `${product.title} · BidNest`,
      description: product.description.slice(0, 160),
    }
  } catch {
    return { title: "สินค้า · BidNest" }
  }
}

export default async function ProductDetailPage({
  params,
}: PageProps<"/shop/[id]">) {
  const { id } = await params
  const product = await loadProduct(id)

  return (
    <div className="mx-auto w-full max-w-330 px-4 pb-16 md:px-6">
      <nav className="flex items-center gap-1 py-6 text-sm text-n-500">
        <Link href="/shop" className="transition-colors hover:text-ink">
          สินค้าทั้งหมด
        </Link>
        <ChevronRight className="size-4" />
        <Link
          href={`/shop?categoryIds=${product.category.id}`}
          className="transition-colors hover:text-ink"
        >
          {categoryLabel(product.category)}
        </Link>
        <ChevronRight className="size-4" />
        <span className="line-clamp-1 text-ink">{product.title}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex flex-col gap-8">
          <ProductGallery images={product.images} title={product.title} />

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="new">{CONDITION_LABEL[product.condition]}</Badge>
              {product.status !== "ACTIVE" && (
                <Badge variant="sold">ปิดการขายชั่วคราว</Badge>
              )}
            </div>
            <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
              {product.title}
            </h1>
            <p className="mt-2 text-sm text-n-500">
              ผู้ขาย: {product.seller.displayName ?? "ไม่ระบุชื่อ"} · ลงขายเมื่อ{" "}
              {formatDate(product.createdAt)}
            </p>
          </div>

          <Tabs defaultValue="details">
            <TabsList>
              <TabsTrigger value="details">รายละเอียด</TabsTrigger>
              <TabsTrigger value="condition">สภาพสินค้า</TabsTrigger>
              <TabsTrigger value="seller">ผู้ขาย</TabsTrigger>
            </TabsList>

            <TabsContent
              value="details"
              className="rounded-r4 bg-white p-6 text-base leading-relaxed whitespace-pre-line text-n-700 shadow-sh1"
            >
              {product.description}
            </TabsContent>

            <TabsContent
              value="condition"
              className="rounded-r4 bg-white p-6 text-base text-n-700 shadow-sh1"
            >
              <dl className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-sm text-n-500">สภาพ</dt>
                  <dd className="font-semibold text-ink">
                    {CONDITION_LABEL[product.condition]}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-n-500">คงเหลือ</dt>
                  <dd className="font-semibold text-ink">
                    {product.stockQty} ชิ้น
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-n-500">หมวดหมู่</dt>
                  <dd className="font-semibold text-ink">
                    {categoryLabel(product.category)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-n-500">อัปเดตล่าสุด</dt>
                  <dd className="font-semibold text-ink">
                    {formatDate(product.updatedAt)}
                  </dd>
                </div>
              </dl>
            </TabsContent>

            <TabsContent
              value="seller"
              className="rounded-r4 bg-white p-6 text-base text-n-700 shadow-sh1"
            >
              <p className="font-display text-lg font-bold text-ink">
                {product.seller.displayName ?? "ไม่ระบุชื่อ"}
              </p>
              <p className="mt-2 text-sm text-n-600">
                กดปุ่ม &ldquo;ต่อรองราคากับผู้ขาย&rdquo;
                เพื่อเปิดห้องสนทนากับผู้ขายรายนี้โดยตรง
              </p>
            </TabsContent>
          </Tabs>
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <ProductPurchasePanel product={product} />
        </aside>
      </div>
    </div>
  )
}

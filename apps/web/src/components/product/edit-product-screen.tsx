"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

import { ProductImageManager } from "@/components/product/product-image-manager"
import { SellerShell } from "@/components/auction/seller-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ApiError } from "@/lib/api/client"
import { listCategories } from "@/lib/api/categories"
import { getProduct, updateProduct } from "@/lib/api/products"
import { categoryLabel } from "@/lib/category-labels"
import type { CategoryTree, OwnerProduct } from "@/lib/api/types"

const CONDITIONS: Record<string, string> = {
  NEW: "ใหม่",
  USED: "มือสอง",
}

/** PROD-002 — change a listing that is already on sale. */
export function EditProductScreen({ productId }: { productId: string }) {
  return (
    <SellerShell>
      <Editor productId={productId} />
    </SellerShell>
  )
}

function Editor({ productId }: { productId: string }) {
  const [product, setProduct] = useState<OwnerProduct | null>(null)
  const [categories, setCategories] = useState<CategoryTree[]>([])
  const [loadError, setLoadError] = useState<unknown>(null)

  useEffect(() => {
    let cancelled = false

    Promise.all([getProduct(productId), listCategories().catch(() => [])])
      .then(([loaded, trees]) => {
        if (cancelled) return
        setProduct(loaded as OwnerProduct)
        setCategories(trees)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setLoadError(caught)
      })

    return () => {
      cancelled = true
    }
  }, [productId])

  if (loadError) {
    return (
      <div className="rounded-r4 border border-red bg-red-50 px-6 py-8 text-center">
        <p className="font-semibold text-red">
          {loadError instanceof ApiError
            ? loadError.message
            : "โหลดสินค้าไม่สำเร็จ"}
        </p>
      </div>
    )
  }

  if (!product) {
    return (
      <div
        className="h-96 rounded-r4 bg-white shadow-sh1 motion-safe:animate-pulse"
        aria-hidden="true"
      />
    )
  }

  return (
    <div className="space-y-6">
      <DetailsForm
        productId={productId}
        product={product}
        categories={categories}
        onSaved={setProduct}
      />

      <ProductImageManager
        productId={productId}
        product={product}
        onChange={setProduct}
      />

      <p className="text-sm text-n-600">
        <Link href={`/shop/${productId}`} className="font-semibold text-amber-600 hover:text-ink">
          ดูหน้าที่ผู้ซื้อเห็น
        </Link>
      </p>
    </div>
  )
}

function DetailsForm({
  productId,
  product,
  categories,
  onSaved,
}: {
  productId: string
  product: OwnerProduct
  categories: CategoryTree[]
  onSaved: (product: OwnerProduct) => void
}) {
  const [categoryId, setCategoryId] = useState(product.category.id)
  const [condition, setCondition] = useState<string>(product.condition)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const options: Record<string, string> = {}
  for (const root of categories) {
    options[root.id] = categoryLabel(root)
    for (const child of root.children) options[child.id] = categoryLabel(child)
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSaved(false)

    const form = new FormData(event.currentTarget)
    const number = (name: string) => {
      const raw = form.get(name)
      return raw === null || raw === "" ? undefined : Number(raw)
    }

    setSubmitting(true)
    try {
      /**
       * No `imageUrls` here, and do not add a URL field that would supply one.
       *
       * `PATCH /products/:id` replaces the whole set when it receives
       * `imageUrls` — it deletes every row and recreates them with invented
       * storage keys. The files those rows pointed at stay in Cloudinary with
       * nothing referencing them: invisible, and never cleaned up. Pictures
       * belong to ProductImageManager, which goes through the routes that know
       * how to remove the file too.
       */
      onSaved(
        await updateProduct(productId, {
          title: String(form.get("title") ?? "").trim(),
          description: String(form.get("description") ?? "").trim(),
          categoryId,
          condition: condition === "NEW" ? "NEW" : "USED",
          price: number("price"),
          stockQty: number("stockQty"),
          negotiationFloor: number("negotiationFloor"),
          quantityDiscountMinQty: number("quantityDiscountMinQty"),
          quantityDiscountPercent: number("quantityDiscountPercent"),
        })
      )
      setSaved(true)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "บันทึกไม่สำเร็จ")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="space-y-6 rounded-r4 bg-white p-6 shadow-sh1"
    >
      <div className="space-y-2">
        <Label htmlFor="title">ชื่อสินค้า</Label>
        <Input
          id="title"
          name="title"
          defaultValue={product.title}
          required
          maxLength={200}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">รายละเอียด</Label>
        <textarea
          id="description"
          name="description"
          defaultValue={product.description}
          required
          rows={5}
          className="w-full rounded-r3 border border-n-300 px-3 py-2 text-base outline-none focus:border-amber-500"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="category">หมวดหมู่</Label>
          <Select
            items={options}
            value={categoryId || null}
            onValueChange={(value) => setCategoryId(String(value ?? ""))}
          >
            <SelectTrigger id="category" className="h-12 w-full">
              <SelectValue placeholder="เลือกหมวดหมู่" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(options).map(([id, label]) => (
                <SelectItem key={id} value={id}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="condition">สภาพสินค้า</Label>
          <Select
            items={CONDITIONS}
            value={condition}
            onValueChange={(value) =>
              setCondition(value === "NEW" ? "NEW" : "USED")
            }
          >
            <SelectTrigger id="condition" className="h-12 w-full">
              <SelectValue placeholder="เลือกสภาพ" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CONDITIONS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="price">ราคา (บาท)</Label>
          <Input
            id="price"
            name="price"
            type="number"
            min={0}
            step="0.01"
            defaultValue={product.price}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="stockQty">จำนวนในสต็อก</Label>
          {/* PROD-005 — stock reaching 0 flips the listing to OUT_OF_STOCK on
              the server, and back to ACTIVE when it is raised again. */}
          <Input
            id="stockQty"
            name="stockQty"
            type="number"
            min={0}
            step={1}
            defaultValue={product.stockQty}
            required
          />
        </div>
      </div>

      <details className="rounded-r3 border border-n-200 px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold text-ink">
          ตัวเลือกเพิ่มเติม — ราคาต่ำสุดที่ยอมรับ และส่วนลดตามจำนวน
        </summary>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="negotiationFloor">ราคาต่ำสุดที่ยอมรับ</Label>
            <Input
              id="negotiationFloor"
              name="negotiationFloor"
              type="number"
              min={0}
              step="0.01"
              defaultValue={product.negotiationFloor ?? ""}
            />
            <p className="text-xs text-n-500">ผู้ซื้อไม่เห็นตัวเลขนี้</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="quantityDiscountMinQty">ซื้อตั้งแต่ (ชิ้น)</Label>
            <Input
              id="quantityDiscountMinQty"
              name="quantityDiscountMinQty"
              type="number"
              min={2}
              step={1}
              defaultValue={product.quantityDiscount?.minQty ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="quantityDiscountPercent">ลด (%)</Label>
            <Input
              id="quantityDiscountPercent"
              name="quantityDiscountPercent"
              type="number"
              min={0}
              max={100}
              step="0.01"
              defaultValue={product.quantityDiscount?.percent ?? ""}
            />
          </div>
        </div>
      </details>

      {error && (
        <p role="alert" className="text-sm text-rose-600">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" size="lg" disabled={submitting}>
          {submitting ? "กำลังบันทึก…" : "บันทึกการแก้ไข"}
        </Button>
        {saved && !error && (
          <p role="status" className="text-sm font-semibold text-green">
            บันทึกแล้ว
          </p>
        )}
      </div>
    </form>
  )
}

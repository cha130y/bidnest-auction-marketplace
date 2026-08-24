"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { PendingImagePicker } from "@/components/product/pending-image-picker"
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
import { createProduct } from "@/lib/api/products"
import { listCategories } from "@/lib/api/categories"
import { categoryLabel } from "@/lib/category-labels"
import type { CategoryTree } from "@/lib/api/types"

const CONDITIONS: Record<string, string> = {
  NEW: "ใหม่",
  USED: "มือสอง",
}

/**
 * PROD-001 — lists an item for sale.
 *
 * One step rather than the two an auction takes. A listing has no draft state
 * and goes on sale the moment it is saved, so everything the SRS requires —
 * pictures included — has to be here rather than on a page afterwards.
 */
export function CreateProductScreen() {
  return (
    <SellerShell>
      <Form />
    </SellerShell>
  )
}

function Form() {
  const router = useRouter()
  const [categories, setCategories] = useState<CategoryTree[] | null>(null)
  const [categoryId, setCategoryId] = useState("")
  const [condition, setCondition] = useState("USED")
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false

    listCategories()
      .then((result) => {
        if (!cancelled) setCategories(result)
      })
      .catch(() => {
        // An empty list still renders the form; the select simply has nothing
        // to offer, and the API refuses a listing without a category anyway.
        if (!cancelled) setCategories([])
      })

    return () => {
      cancelled = true
    }
  }, [])

  if (!categories) {
    return (
      <div
        className="h-96 rounded-r4 bg-white shadow-sh1 motion-safe:animate-pulse"
        aria-hidden="true"
      />
    )
  }

  // Root categories carry their children; a listing belongs to one of either.
  const options: Record<string, string> = {}
  for (const root of categories) {
    options[root.id] = categoryLabel(root)
    for (const child of root.children) options[child.id] = categoryLabel(child)
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    // Said here rather than left to the API: the pictures are already
    // uploaded by this point, and a round trip to be told what the form can
    // see for itself would lose them.
    if (imageUrls.length === 0) {
      setError("ต้องมีรูปสินค้าอย่างน้อย 1 รูป")
      return
    }

    const form = new FormData(event.currentTarget)
    const number = (name: string) => {
      const raw = form.get(name)
      return raw === null || raw === "" ? undefined : Number(raw)
    }

    setSubmitting(true)
    try {
      const product = await createProduct({
        title: String(form.get("title") ?? "").trim(),
        description: String(form.get("description") ?? "").trim(),
        categoryId,
        condition: condition === "NEW" ? "NEW" : "USED",
        price: number("price") ?? 0,
        stockQty: number("stockQty") ?? 0,
        imageUrls,
        negotiationFloor: number("negotiationFloor"),
        quantityDiscountMinQty: number("quantityDiscountMinQty"),
        quantityDiscountPercent: number("quantityDiscountPercent"),
      })

      router.push(`/shop/${product.id}`)
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "บันทึกไม่สำเร็จ"
      )
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="space-y-6 rounded-r4 bg-white p-6 shadow-sh1"
    >
      <div className="space-y-2">
        <Label htmlFor="title">ชื่อสินค้า *</Label>
        <Input id="title" name="title" required maxLength={200} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">รายละเอียด *</Label>
        <textarea
          id="description"
          name="description"
          required
          rows={5}
          className="w-full rounded-r3 border border-n-300 px-3 py-2 text-base outline-none focus:border-amber-500"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="category">หมวดหมู่ *</Label>
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
          <Label htmlFor="condition">สภาพสินค้า *</Label>
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
          <Label htmlFor="price">ราคา (บาท) *</Label>
          <Input
            id="price"
            name="price"
            type="number"
            min={0}
            step="0.01"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="stockQty">จำนวนในสต็อก *</Label>
          <Input
            id="stockQty"
            name="stockQty"
            type="number"
            min={0}
            step={1}
            required
          />
        </div>
      </div>

      <PendingImagePicker
        urls={imageUrls}
        onChange={setImageUrls}
        disabled={submitting}
      />

      <details className="rounded-r3 border border-n-200 px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold text-ink">
          ตัวเลือกเพิ่มเติม — ราคาต่ำสุดที่ยอมรับ และส่วนลดตามจำนวน
        </summary>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="negotiationFloor">ราคาต่ำสุดที่ยอมรับ</Label>
            {/* PROD-006 — never leaves the server on a buyer-facing route. */}
            <Input
              id="negotiationFloor"
              name="negotiationFloor"
              type="number"
              min={0}
              step="0.01"
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
            />
          </div>
        </div>
      </details>

      {error && (
        <p role="alert" className="text-sm text-rose-600">
          {error}
        </p>
      )}

      <Button type="submit" variant="primary" size="lg" disabled={submitting}>
        {submitting ? "กำลังบันทึก…" : "ลงขายสินค้า"}
      </Button>
    </form>
  )
}
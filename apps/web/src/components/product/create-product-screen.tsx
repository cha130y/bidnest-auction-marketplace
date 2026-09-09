"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { FloorWarningNote } from "@/components/product/floor-warning-note"
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
import type { CategoryTree, SavedProduct } from "@/lib/api/types"

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
  /**
   * PROD-007 — the listing this screen just created, held only when the server
   * had an advisory about it.
   *
   * This screen normally leaves for the listing page the moment it saves,
   * which would carry a warning off the screen before anyone read it. Set,
   * this stays put and offers the same destination as a link instead — and
   * takes the create button away with it, because the listing already exists
   * and pressing it again would file a second one.
   */
  const [saved, setSaved] = useState<SavedProduct | null>(null)
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

      if (product.warnings.length > 0) {
        setSaved(product)
        setSubmitting(false)
        return
      }

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

        {/*
          Two settings, not three fields. PROD-006's floor stands on its own,
          while PROD-007's two are refused unless both are filled — see
          ProductService.assertDiscountRuleIsComplete. A single three-column row
          read as three peers, so a seller who filled only "ซื้อตั้งแต่" learned
          about the pairing from a 400 after saving.
        */}
        <div className="mt-4 space-y-5">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-n-500">การต่อรองราคา</p>
            <Label htmlFor="negotiationFloor">ราคาต่ำสุดที่ยอมรับ</Label>
            {/* PROD-006 — never leaves the server on a buyer-facing route. */}
            <Input
              id="negotiationFloor"
              name="negotiationFloor"
              type="number"
              min={0}
              step="0.01"
              wrapperClassName="sm:max-w-xs"
            />
            <p className="text-xs text-n-500">
              ผู้ซื้อไม่เห็นตัวเลขนี้ — ระบบใช้ตอบข้อเสนอต่อรองราคา
            </p>
          </div>

          <div className="space-y-2 border-t border-n-200 pt-5">
            <p className="text-xs font-semibold text-n-500">
              ส่วนลดเมื่อซื้อหลายชิ้น
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="quantityDiscountMinQty">
                  ซื้อตั้งแต่ (ชิ้น)
                </Label>
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

            <p className="text-xs text-n-500">
              กรอกทั้งสองช่อง หรือเว้นว่างทั้งคู่
            </p>
          </div>
        </div>
      </details>

      {saved && <FloorWarningNote product={saved} />}

      {error && (
        <p role="alert" className="text-sm text-rose-600">
          {error}
        </p>
      )}

      {saved ? (
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/sell/products/${saved.id}`}>
            <Button type="button" variant="primary" size="lg">
              แก้ไขราคาอีกครั้ง
            </Button>
          </Link>
          <Link
            href={`/shop/${saved.id}`}
            className="text-sm font-semibold text-amber-600 hover:text-ink"
          >
            ข้ามไปดูหน้าที่ผู้ซื้อเห็น
          </Link>
        </div>
      ) : (
        <Button type="submit" variant="primary" size="lg" disabled={submitting}>
          {submitting ? "กำลังบันทึก…" : "ลงขายสินค้า"}
        </Button>
      )}
    </form>
  )
}
"use client"

import { useState } from "react"

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
import { categoryLabel } from "@/lib/category-labels"
import type { CreateDraftInput } from "@/lib/api/seller-auctions"
import type { CategoryTree, OwnerAuction } from "@/lib/api/types"

const CONDITIONS: Record<string, string> = {
  NEW: "ของใหม่",
  USED: "มือสอง",
}

/**
 * A `datetime-local` input wants `YYYY-MM-DDTHH:mm` in *local* time, while the
 * API speaks ISO in UTC. Converting by slicing the ISO string would silently
 * shift every time by the timezone offset — seven hours, here.
 */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""

  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const toIso = (local: string): string | undefined =>
  local ? new Date(local).toISOString() : undefined

/**
 * AUC-001 / AUC-006 — the draft form, shared by creating and editing.
 *
 * Only the six fields a draft cannot be written without are marked required
 * here. The schedule, the images and the reserve are the publish gate's
 * business (AUC-002), and leaving them out has to stay possible or a draft is
 * not a draft. What is missing is answered by the API on the draft's own page,
 * not guessed at here.
 *
 * The API is the only validator that counts. This does no rule-checking of its
 * own beyond what the browser gives for free, so there is no second copy of
 * AUC-002 to drift.
 */
export function DraftForm({
  categories,
  initial,
  submitLabel,
  onSubmit,
}: {
  categories: CategoryTree[]
  initial?: OwnerAuction
  submitLabel: string
  onSubmit: (input: CreateDraftInput) => Promise<void>
}) {
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [categoryId, setCategoryId] = useState(initial?.category.id ?? "")
  const [condition, setCondition] = useState(initial?.condition ?? "USED")

  // Root categories carry their children; an auction belongs to one of either.
  const options: Record<string, string> = {}
  for (const root of categories) {
    options[root.id] = categoryLabel(root)
    for (const child of root.children) options[child.id] = categoryLabel(child)
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    const form = new FormData(event.currentTarget)
    const number = (name: string) => {
      const raw = form.get(name)
      return raw === null || raw === "" ? undefined : Number(raw)
    }
    /**
     * No images here, on purpose. Pictures are added on the draft's own page
     * once it exists, because uploading needs an id to upload *to*.
     *
     * Do not put a URL field back on this form: `PATCH /auctions/:id` replaces
     * the whole set when it receives `imageUrls`, which would delete rows
     * pointing at uploaded files and leave those files in the store with
     * nothing referencing them — invisible, and never cleaned up.
     */
    setSubmitting(true)
    try {
      await onSubmit({
        title: String(form.get("title") ?? "").trim(),
        description: String(form.get("description") ?? "").trim(),
        categoryId,
        condition: condition === "NEW" ? "NEW" : "USED",
        startingPrice: number("startingPrice") ?? 0,
        minBidIncrement: number("minBidIncrement") ?? 0,
        reservePrice: number("reservePrice"),
        scheduledStartAt: toIso(String(form.get("scheduledStartAt") ?? "")),
        scheduledEndAt: toIso(String(form.get("scheduledEndAt") ?? "")),
      })
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <Field label="ชื่อรายการ" htmlFor="title">
        <Input
          id="title"
          name="title"
          required
          maxLength={200}
          defaultValue={initial?.title}
          placeholder="เช่น นาฬิกา Seiko 5 Automatic"
        />
      </Field>

      <Field label="รายละเอียด" htmlFor="description">
        <textarea
          id="description"
          name="description"
          required
          rows={5}
          defaultValue={initial?.description}
          placeholder="สภาพสินค้า อุปกรณ์ที่ให้มา ประวัติการใช้งาน"
          className="w-full rounded-r3 border border-n-300 bg-white px-4 py-3 text-sm text-ink outline-none focus:border-amber-500 focus:shadow-focus"
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="หมวดหมู่" htmlFor="category">
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
        </Field>

        <Field label="สภาพสินค้า" htmlFor="condition">
          <Select
            items={CONDITIONS}
            value={condition}
            onValueChange={(value) => setCondition(value === "NEW" ? "NEW" : "USED")}
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
        </Field>

        <Field label="ราคาเริ่มต้น (บาท)" htmlFor="startingPrice">
          <Input
            id="startingPrice"
            name="startingPrice"
            type="number"
            step="0.01"
            min="0.01"
            required
            defaultValue={initial?.startingPrice}
          />
        </Field>

        <Field label="เพิ่มขั้นต่ำครั้งละ (บาท)" htmlFor="minBidIncrement">
          <Input
            id="minBidIncrement"
            name="minBidIncrement"
            type="number"
            step="0.01"
            min="0.01"
            required
            defaultValue={initial?.minBidIncrement}
          />
        </Field>

        <Field
          label="ราคาขั้นต่ำที่ยอมขาย (บาท)"
          htmlFor="reservePrice"
          // AUC-003 — the seller's alone, and worth saying so on the form that
          // collects it, because the whole point is that it stays private.
          hint="ไม่บังคับ · ผู้ซื้อจะไม่เห็นตัวเลขนี้ เห็นแค่ว่าถึงแล้วหรือยัง"
        >
          <Input
            id="reservePrice"
            name="reservePrice"
            type="number"
            step="0.01"
            min="0.01"
            defaultValue={initial?.reservePrice ?? ""}
          />
        </Field>

        <Field label="เวลาเริ่ม" htmlFor="scheduledStartAt" hint="ไม่บังคับตอนร่าง">
          <Input
            id="scheduledStartAt"
            name="scheduledStartAt"
            type="datetime-local"
            defaultValue={toLocalInput(initial?.scheduledStartAt)}
          />
        </Field>

        <Field label="เวลาปิด" htmlFor="scheduledEndAt" hint="ไม่บังคับตอนร่าง">
          <Input
            id="scheduledEndAt"
            name="scheduledEndAt"
            type="datetime-local"
            // `scheduledEndAt` is an input name; what comes back is
            // `originalEndAt` — the end as scheduled — and `currentEndAt`,
            // which anti-sniping moves. Prefilling the moved one would let a
            // seller re-submit an extension as if it were their own schedule.
            defaultValue={toLocalInput(initial?.originalEndAt)}
          />
        </Field>
      </div>

      {error && (
        <p role="alert" className="text-sm font-medium text-red">
          {error}
        </p>
      )}

      <Button type="submit" variant="primary" size="lg" disabled={submitting}>
        {submitting ? "กำลังบันทึก…" : submitLabel}
      </Button>
    </form>
  )
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string
  htmlFor: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-n-500">{hint}</p>}
    </div>
  )
}

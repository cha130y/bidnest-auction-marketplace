"use client"

import { useState, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { categoryLabel } from "@/lib/category-labels"
import { cn } from "@/lib/utils"
import type { CategoryTree } from "@/lib/api/types"

/**
 * What the panel collects. Deliberately not `ShopSearch`: `sort` and `page` are
 * the catalog's own concerns and are decided elsewhere on the page, so a list
 * that pages differently — or does not page at all — can still use this.
 */
export type FilterValues = {
  q?: string
  categoryIds: string[]
  minPrice?: number
  maxPrice?: number
}

type FilterPanelProps = {
  /** Current state, normally parsed out of the URL by the calling page. */
  values: FilterValues
  /** Empty is allowed and hides the whole category block. */
  categories: CategoryTree[]
  /** Handed everything the panel collected; the caller decides where to go. */
  onApply: (values: FilterValues) => void
  onClear: () => void
  /**
   * The search field, as a render prop rather than a component.
   *
   * The panel owns `q` — it has to, since "ใช้ตัวกรอง" submits it alongside the
   * categories and the price — but it must not own *what the field does while
   * you type*. The catalog's box previews matching products and jumps straight
   * to one (`searchProducts` + `/shop/:id`), which is meaningless on any other
   * list. Handing the state down and letting the call site draw the field keeps
   * that knowledge where it belongs, and lets a caller with nothing to suggest
   * pass a plain `<Input>` instead.
   *
   * Omitted entirely, the search block is not rendered.
   */
  renderSearch?: (props: {
    value: string
    onChange: (value: string) => void
    onSubmit: () => void
  }) => ReactNode
  /** "ช่วงราคา" on the catalog; an auction may want to name which price. */
  priceLabel?: string
  /** Omitted hides the price block, for a list where price is not a filter. */
  showPrice?: boolean
}

/**
 * The filter sidebar: search, a category tree, a price range, apply and clear.
 *
 * Shared rather than shop-only because the auction list wants the same four
 * things against the same category tree — `Auction` carries `categoryId`,
 * `title`, `description` and `currentPrice`, and the panel does not care which
 * of the two it is filtering.
 *
 * It holds no result set and fetches nothing. Everything it gathers leaves
 * through `onApply`, so the calling page stays free to be a Server Component
 * that renders from the URL — which is what both lists already do.
 *
 * Mount it with a `key` derived from the URL: a "clear" or a back-navigation
 * has to re-seed these inputs, and state initialised from props will not.
 */
export function FilterPanel({
  values,
  categories,
  onApply,
  onClear,
  renderSearch,
  priceLabel = "ช่วงราคา",
  showPrice = true,
}: FilterPanelProps) {
  const [q, setQ] = useState(values.q ?? "")
  const [minPrice, setMinPrice] = useState(values.minPrice?.toString() ?? "")
  const [maxPrice, setMaxPrice] = useState(values.maxPrice?.toString() ?? "")
  const [categoryIds, setCategoryIds] = useState<string[]>(values.categoryIds)

  // Collapsed by default so the panel is scannable at a glance; a group that
  // already has something selected opens, otherwise that selection is hidden
  const [expandedIds, setExpandedIds] = useState<string[]>(() =>
    categories
      .filter((root) =>
        root.children.some((child) => values.categoryIds.includes(child.id))
      )
      .map((root) => root.id)
  )

  const toggleCategory = (id: string, checked: boolean) => {
    setCategoryIds((current) =>
      checked ? [...current, id] : current.filter((value) => value !== id)
    )
  }

  const toggleExpanded = (id: string) => {
    setExpandedIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id]
    )
  }

  const apply = () => {
    const min = minPrice.trim() === "" ? undefined : Number(minPrice)
    const max = maxPrice.trim() === "" ? undefined : Number(maxPrice)

    onApply({
      q: q.trim() || undefined,
      categoryIds,
      minPrice: Number.isFinite(min) ? min : undefined,
      maxPrice: Number.isFinite(max) ? max : undefined,
    })
  }

  // Mirrors the guard in ProductService.search so the user is told before the
  // API has to 400
  const invalidRange =
    showPrice &&
    minPrice.trim() !== "" &&
    maxPrice.trim() !== "" &&
    Number(minPrice) > Number(maxPrice)

  return (
    <form
      className="flex flex-col gap-6 rounded-r4 bg-white p-5 shadow-sh1"
      onSubmit={(event) => {
        event.preventDefault()
        if (!invalidRange) apply()
      }}
    >
      {renderSearch && (
        <div>
          <h2 className="font-display text-base font-bold text-ink">ค้นหา</h2>
          {renderSearch({
            value: q,
            onChange: setQ,
            onSubmit: () => {
              if (!invalidRange) apply()
            },
          })}
        </div>
      )}

      {categories.length > 0 && (
        <div>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-ink">
              หมวดหมู่
            </h2>
            {categoryIds.length > 0 && (
              <button
                type="button"
                className="text-xs font-semibold text-amber-600 hover:underline"
                onClick={() => setCategoryIds([])}
              >
                ล้าง {categoryIds.length}
              </button>
            )}
          </div>

          <div className="mt-3 flex flex-col">
            {categories.map((root) => {
              const isOpen = expandedIds.includes(root.id)

              return (
                <div key={root.id} className="border-b border-n-200 last:border-0">
                  <div className="flex items-center gap-2 py-1">
                    <label className="flex flex-1 cursor-pointer items-center gap-3 py-1.5 text-sm font-semibold text-ink">
                      <Checkbox
                        checked={categoryIds.includes(root.id)}
                        onCheckedChange={(checked) =>
                          toggleCategory(root.id, checked)
                        }
                      />
                      {categoryLabel(root)}
                    </label>

                    {root.children.length > 0 && (
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-label={`${isOpen ? "ซ่อน" : "แสดง"}หมวดย่อยของ${categoryLabel(root)}`}
                        onClick={() => toggleExpanded(root.id)}
                        className="flex size-7 shrink-0 items-center justify-center rounded-r1 text-n-500 transition-colors hover:bg-n-100 hover:text-ink"
                      >
                        <ChevronDown
                          className={cn(
                            "size-4 transition-transform",
                            isOpen && "rotate-180"
                          )}
                        />
                      </button>
                    )}
                  </div>

                  {isOpen &&
                    root.children.map((child) => (
                      <label
                        key={child.id}
                        className="flex cursor-pointer items-center gap-3 py-1.5 pl-6 text-sm text-n-600"
                      >
                        <Checkbox
                          checked={categoryIds.includes(child.id)}
                          onCheckedChange={(checked) =>
                            toggleCategory(child.id, checked)
                          }
                        />
                        {categoryLabel(child)}
                      </label>
                    ))}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {showPrice && (
        <div>
          <h2 className="font-display text-base font-bold text-ink">
            {priceLabel}
          </h2>
          <div className="mt-3 flex items-center gap-2">
            <Input
              type="number"
              min={0}
              inputMode="decimal"
              value={minPrice}
              onChange={(event) => setMinPrice(event.target.value)}
              placeholder="ต่ำสุด"
              invalid={invalidRange}
              wrapperClassName="h-12 px-4"
            />
            <span className="text-n-400">–</span>
            <Input
              type="number"
              min={0}
              inputMode="decimal"
              value={maxPrice}
              onChange={(event) => setMaxPrice(event.target.value)}
              placeholder="สูงสุด"
              invalid={invalidRange}
              wrapperClassName="h-12 px-4"
            />
          </div>
          {invalidRange && (
            <p className="mt-2 text-xs text-red">
              ราคาต่ำสุดต้องไม่มากกว่าราคาสูงสุด
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Button type="submit" disabled={invalidRange} block>
          ใช้ตัวกรอง
        </Button>
        <Button type="button" variant="ghost" block onClick={onClear}>
          ล้างตัวกรอง
        </Button>
      </div>
    </form>
  )
}
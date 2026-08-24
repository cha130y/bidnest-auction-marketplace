"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown } from "lucide-react"

import { ProductSearchBox } from "@/components/shop/product-search-box"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { categoryLabel } from "@/lib/category-labels"
import { shopHref, type ShopSearch } from "@/lib/shop-search"
import { cn } from "@/lib/utils"
import type { CategoryTree } from "@/lib/api/types"

type ProductFiltersProps = {
  search: ShopSearch
  categories: CategoryTree[]
}

/**
 * The only interactive part of the catalog. Everything it collects goes into
 * the URL — the page re-renders on the server from there, so nothing here has
 * to hold the result set.
 *
 * Mounted with a `key` derived from the URL, so a "clear" or a back-navigation
 * re-seeds these inputs instead of leaving stale text behind.
 */
export function ProductFilters({ search, categories }: ProductFiltersProps) {
  const router = useRouter()
  const [q, setQ] = useState(search.q ?? "")
  const [minPrice, setMinPrice] = useState(search.minPrice?.toString() ?? "")
  const [maxPrice, setMaxPrice] = useState(search.maxPrice?.toString() ?? "")
  const [categoryIds, setCategoryIds] = useState<string[]>(search.categoryIds)

  // Collapsed by default so the panel is scannable at a glance; a group that
  // already has something selected opens, otherwise that selection is hidden
  const [expandedIds, setExpandedIds] = useState<string[]>(() =>
    categories
      .filter((root) =>
        root.children.some((child) => search.categoryIds.includes(child.id))
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

    router.push(
      shopHref(search, {
        q: q.trim() || undefined,
        categoryIds,
        minPrice: Number.isFinite(min) ? min : undefined,
        maxPrice: Number.isFinite(max) ? max : undefined,
      })
    )
  }

  // Mirrors the guard in ProductService.search so the user is told before the
  // API has to 400
  const invalidRange =
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
      <div>
        <h2 className="font-display text-base font-bold text-ink">ค้นหา</h2>
        <ProductSearchBox
          value={q}
          onChange={setQ}
          onSubmit={() => {
            if (!invalidRange) apply()
          }}
        />
      </div>

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

      <div>
        <h2 className="font-display text-base font-bold text-ink">ช่วงราคา</h2>
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

      <div className="flex flex-col gap-2">
        <Button type="submit" disabled={invalidRange} block>
          ใช้ตัวกรอง
        </Button>
        <Button
          type="button"
          variant="ghost"
          block
          onClick={() => router.push("/shop")}
        >
          ล้างตัวกรอง
        </Button>
      </div>
    </form>
  )
}

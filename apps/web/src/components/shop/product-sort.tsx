"use client"

import { useRouter } from "next/navigation"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PRODUCT_SORTS, shopHref, type ShopSearch } from "@/lib/shop-search"
import type { ProductSort } from "@/lib/api/types"

/**
 * Base UI renders the raw value in the trigger unless the Root is told how a
 * value maps to a label — without this the trigger reads "price_desc".
 */
const SORT_LABELS: Record<string, string> = Object.fromEntries(
  PRODUCT_SORTS.map((option) => [option.value, option.label])
)

export function ProductSortSelect({ search }: { search: ShopSearch }) {
  const router = useRouter()

  return (
    <Select
      items={SORT_LABELS}
      value={search.sort ?? null}
      onValueChange={(value) => {
        router.push(shopHref(search, { sort: (value as ProductSort) ?? undefined }))
      }}
    >
      <SelectTrigger className="h-12 w-52">
        <SelectValue placeholder="เรียงลำดับ" />
      </SelectTrigger>
      <SelectContent>
        {PRODUCT_SORTS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

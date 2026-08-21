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

export function ProductSortSelect({ search }: { search: ShopSearch }) {
  const router = useRouter()

  return (
    <Select
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

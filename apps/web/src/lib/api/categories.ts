import { apiFetch } from "@/lib/api/client"
import type { CategoryTree } from "@/lib/api/types"

/** `@Public()` — active root categories, each with its active children. */
export function listCategories() {
  return apiFetch<CategoryTree[]>("/categories")
}

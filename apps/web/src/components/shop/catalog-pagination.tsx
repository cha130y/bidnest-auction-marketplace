import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "@/components/ui/pagination"
import { shopHref, type ShopSearch } from "@/lib/shop-search"

/** First page, last page, and the current page with a neighbour on each side. */
function pageWindow(current: number, totalPages: number): (number | "gap")[] {
  const pages = new Set([1, totalPages, current - 1, current, current + 1])
  const visible = [...pages]
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b)

  return visible.flatMap((page, index) =>
    index > 0 && page - visible[index - 1] > 1
      ? (["gap", page] as (number | "gap")[])
      : [page]
  )
}

type CatalogPaginationProps = {
  search: ShopSearch
  meta: { page: number; totalPages: number }
}

/**
 * "ก่อนหน้า" and "ถัดไป", greyed out when there is nowhere to go.
 *
 * `Button` carries `disabled:opacity-45` already, but that compiles to the
 * `:disabled` pseudo-class, which only ever matches a form element. These two
 * render as a `<span>` at the ends of the range — see below — so none of the
 * base styling ever reached them, and "ก่อนหน้า" on page 1 looked exactly like
 * a button that works.
 *
 * Keyed off `aria-disabled` instead, which Base UI puts on the element in both
 * cases. The page buttons in the middle are unaffected: they are never
 * disabled, so the variants never match.
 */
const edgeButton =
  "border-0 shadow-sh1 aria-disabled:pointer-events-none aria-disabled:opacity-45 aria-disabled:shadow-none"

/**
 * Plain links rather than the `PaginationLink` primitive: that one renders a
 * bare `<a>`, which would full-reload the catalog on every page change.
 */
export function CatalogPagination({ search, meta }: CatalogPaginationProps) {
  if (meta.totalPages <= 1) return null

  const linkTo = (page: number) => shopHref(search, { page })

  return (
    <Pagination className="mt-10">
      <PaginationContent>
        <PaginationItem>
          <Button
            variant="secondary"
            size="md"
            className={`${edgeButton} pl-1.5!`}
            disabled={meta.page <= 1}
            nativeButton={false}
            render={
              meta.page <= 1 ? (
                <span aria-disabled />
              ) : (
                <Link href={linkTo(meta.page - 1)} aria-label="หน้าก่อนหน้า" />
              )
            }
          >
            <ChevronLeft />
            <span className="hidden sm:block">ก่อนหน้า</span>
          </Button>
        </PaginationItem>

        {pageWindow(meta.page, meta.totalPages).map((page, index) =>
          page === "gap" ? (
            <PaginationItem key={`gap-${index}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={page}>
              <Button
                variant={page === meta.page ? "primary" : "secondary"}
                size="icon"
                className={cnPageButton(page === meta.page)}
                nativeButton={false}
                render={
                  <Link
                    href={linkTo(page)}
                    aria-current={page === meta.page ? "page" : undefined}
                  />
                }
              >
                {page}
              </Button>
            </PaginationItem>
          )
        )}

        <PaginationItem>
          <Button
            variant="secondary"
            size="md"
            className={`${edgeButton} pr-1.5!`}
            disabled={meta.page >= meta.totalPages}
            nativeButton={false}
            render={
              meta.page >= meta.totalPages ? (
                <span aria-disabled />
              ) : (
                <Link href={linkTo(meta.page + 1)} aria-label="หน้าถัดไป" />
              )
            }
          >
            <span className="hidden sm:block">ถัดไป</span>
            <ChevronRight />
          </Button>
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  )
}

function cnPageButton(isActive: boolean): string {
  return isActive
    ? "rounded-r2 font-semibold"
    : "rounded-r2 border-0 font-semibold shadow-sh1"
}

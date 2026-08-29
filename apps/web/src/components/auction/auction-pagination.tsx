import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "@/components/ui/pagination"
import { auctionHref, type AuctionSearch } from "@/lib/auction-search"

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

/**
 * Built on Dev 1's `Pagination` primitives so it matches the catalog's paging
 * without copying Dev 3's composition: `CatalogPagination` is the same shape
 * but its links are hard-wired to `shopHref`. Lifting an `hrefFor` prop out of
 * it would let one component serve both, which is worth doing — but it edits a
 * file Dev 3 owns, so it is flagged here rather than done in passing.
 *
 * Plain links rather than the `PaginationLink` primitive: that one renders a
 * bare `<a>`, which would full-reload the list on every page change.
 */
export function AuctionPagination({
  search,
  meta,
}: {
  search: AuctionSearch
  meta: { page: number; totalPages: number }
}) {
  if (meta.totalPages <= 1) return null

  const linkTo = (page: number) => auctionHref(search, { page })

  return (
    <Pagination className="mt-10">
      <PaginationContent>
        <PaginationItem>
          <Button
            variant="secondary"
            size="md"
            className="border-0 pl-1.5! shadow-sh1"
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
                className={
                  page === meta.page
                    ? "rounded-r2 font-semibold"
                    : "rounded-r2 border-0 font-semibold shadow-sh1"
                }
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
            className="border-0 pr-1.5! shadow-sh1"
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

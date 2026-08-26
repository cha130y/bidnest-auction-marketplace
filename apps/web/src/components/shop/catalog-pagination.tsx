import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "@/components/ui/pagination"
import { edgeButton, pageButtonClass, pageWindow } from "@/lib/pagination"
import { shopHref, type ShopSearch } from "@/lib/shop-search"

type CatalogPaginationProps = {
  search: ShopSearch
  meta: { page: number; totalPages: number }
}

/**
 * "ก่อนหน้า" and "ถัดไป", greyed out when there is nowhere to go.
 *
 * The link-driven pager: a shop page is bookmarked and shared, so which page
 * you are on belongs in the URL. `PageNav` in ui/ is the callback-driven twin
 * for lists behind a login, and the two share their window, their greyed-out
 * ends and their button shapes from there.
 *
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
                className={pageButtonClass(page === meta.page)}
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

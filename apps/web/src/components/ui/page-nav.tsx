"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "@/components/ui/pagination"
import { edgeButton, pageButtonClass, pageWindow } from "@/lib/pagination"

/**
 * The same pager the catalogue uses, driven by a callback instead of by links.
 *
 * The catalogue's own pager reads and writes the URL, because a shop page is
 * something people bookmark and share. An order list is neither: it is behind
 * a login, it is read once, and it is drawn by a client component that already
 * holds the page in state. Making it navigate would mean a round trip and a
 * re-render of the whole route to move one list down by ten rows.
 *
 * Everything the two do share — the window of page numbers, the greyed-out
 * ends, the button shapes — lives in this file so the two cannot drift into
 * looking like different components.
 */
export function PageNav({
  page,
  totalPages,
  onChange,
  className,
}: {
  page: number
  totalPages: number
  onChange: (page: number) => void
  className?: string
}) {
  if (totalPages <= 1) return null

  return (
    <Pagination className={className ?? "mt-8"}>
      <PaginationContent>
        <PaginationItem>
          <Button
            variant="secondary"
            size="md"
            className={`${edgeButton} pl-1.5!`}
            disabled={page <= 1}
            aria-label="หน้าก่อนหน้า"
            onClick={() => onChange(page - 1)}
          >
            <ChevronLeft />
            <span className="hidden sm:block">ก่อนหน้า</span>
          </Button>
        </PaginationItem>

        {pageWindow(page, totalPages).map((entry, index) =>
          entry === "gap" ? (
            <PaginationItem key={`gap-${index}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={entry}>
              <Button
                variant={entry === page ? "primary" : "secondary"}
                size="icon"
                className={pageButtonClass(entry === page)}
                aria-current={entry === page ? "page" : undefined}
                onClick={() => onChange(entry)}
              >
                {entry}
              </Button>
            </PaginationItem>
          )
        )}

        <PaginationItem>
          <Button
            variant="secondary"
            size="md"
            className={`${edgeButton} pr-1.5!`}
            disabled={page >= totalPages}
            aria-label="หน้าถัดไป"
            onClick={() => onChange(page + 1)}
          >
            <span className="hidden sm:block">ถัดไป</span>
            <ChevronRight />
          </Button>
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  )
}
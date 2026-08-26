/**
 * The pieces both pagers share, kept out of any `"use client"` module.
 *
 * `CatalogPagination` is a Server Component and `PageNav` is a Client one.
 * When these lived in the client file, the catalogue crashed with "Attempted
 * to call pageWindow() from the server but pageWindow is on the client" —
 * a `"use client"` boundary turns every export into a client reference, and a
 * plain function cannot be called across it. Neither pager needs the browser
 * to work these out, so neither should have to reach across.
 */

/** First page, last page, and the current page with a neighbour on each side. */
export function pageWindow(
  current: number,
  totalPages: number
): (number | "gap")[] {
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
 * `Button` carries `disabled:opacity-45` already, but that compiles to the
 * `:disabled` pseudo-class, which only ever matches a form element — and the
 * catalogue's ends render as a `<span>` so it never reached them. Keyed off
 * `aria-disabled` instead, which Base UI sets in both cases.
 */
export const edgeButton =
  "border-0 shadow-sh1 aria-disabled:pointer-events-none aria-disabled:opacity-45 aria-disabled:shadow-none"

export function pageButtonClass(isActive: boolean): string {
  return isActive
    ? "rounded-r2 font-semibold"
    : "rounded-r2 border-0 font-semibold shadow-sh1"
}
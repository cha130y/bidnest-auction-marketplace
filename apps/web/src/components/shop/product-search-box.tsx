"use client"

import { useEffect, useId, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Search } from "lucide-react"

import { ProductImage } from "@/components/shop/product-image"
import { Input } from "@/components/ui/input"
import { searchProducts } from "@/lib/api/products"
import { formatTHB } from "@/lib/format"
import type { Product } from "@/lib/api/types"

/** Below this a query matches most of the catalogue and tells nobody anything. */
const MIN_QUERY = 2
const SUGGESTION_LIMIT = 5
const DEBOUNCE_MS = 250

/**
 * PROD-003 — the catalogue search field, with a preview of what it will find.
 *
 * The field on its own already worked: type, press "ใช้ตัวกรอง", get a filtered
 * page. What it did not do was answer while you were still typing, which reads
 * as nothing happening at all.
 *
 * Three things keep that from turning into a mess of requests and stale
 * answers:
 *
 * - a debounce, so a word costs one request rather than one per letter;
 * - a request id, because responses do not come back in the order they were
 *   sent — without it a slow answer for "bla" lands after "blanket" and
 *   silently replaces a correct list with a wrong one;
 * - a cancelled flag, so a component that has gone away does not set state.
 *
 * A failed lookup closes the list rather than reporting anything. This is a
 * convenience on top of a form that still works: telling somebody their
 * suggestions failed, while the thing they were typing into is fine, is noise.
 */
export function ProductSearchBox({
  value,
  onChange,
  onSubmit,
}: {
  value: string
  onChange: (value: string) => void
  /** Runs when Enter is pressed with nothing highlighted in the list. */
  onSubmit: () => void
}) {
  const router = useRouter()
  const listId = useId()
  const box = useRef<HTMLDivElement>(null)

  const [suggestions, setSuggestions] = useState<Product[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)

  // Not state: it is never rendered, and bumping it must take effect for the
  // response that is already in flight rather than on the next render.
  const latestRequest = useRef(0)

  const query = value.trim()
  const enabled = query.length >= MIN_QUERY

  // Derived rather than stored. Clearing the list from inside the effect would
  // mean a second render for something already knowable during the first, and
  // leaves two places that decide whether the list is up.
  const visible = open && enabled && suggestions.length > 0

  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    const requestId = ++latestRequest.current

    const timer = setTimeout(() => {
      searchProducts({ q: query, limit: SUGGESTION_LIMIT })
        .then((result) => {
          // Two guards, not one: `cancelled` covers unmount and a newer
          // keystroke, `requestId` covers a response that overtook a later one.
          if (cancelled || requestId !== latestRequest.current) return
          setSuggestions(result.items)
          setActive(-1)
          setOpen(result.items.length > 0)
        })
        .catch(() => {
          if (cancelled || requestId !== latestRequest.current) return
          setSuggestions([])
          setOpen(false)
        })
    }, DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, enabled])

  // Clicking anywhere else is a dismissal. pointerdown rather than click so the
  // list is gone before whatever was clicked takes focus.
  useEffect(() => {
    if (!visible) return

    const dismiss = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false)
    }

    document.addEventListener("pointerdown", dismiss)
    return () => document.removeEventListener("pointerdown", dismiss)
  }, [visible])

  const choose = (product: Product) => {
    setOpen(false)
    router.push(`/shop/${product.id}`)
  }

  const handleKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false)
      return
    }

    if (event.key === "Enter") {
      // Enter on a highlighted row opens it; Enter on the typed text belongs
      // to the filter form, which is what the field was already for.
      if (visible && active >= 0 && suggestions[active]) {
        event.preventDefault()
        choose(suggestions[active])
      } else {
        setOpen(false)
        onSubmit()
      }
      return
    }

    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
    if (!enabled || suggestions.length === 0) return

    event.preventDefault()
    setOpen(true)
    setActive((current) => {
      const next = event.key === "ArrowDown" ? current + 1 : current - 1
      // Wraps, so holding one arrow never dead-ends at either edge.
      if (next < 0) return suggestions.length - 1
      if (next >= suggestions.length) return 0
      return next
    })
  }

  return (
    <div ref={box} className="relative">
      <Input
        pill
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKey}
        onFocus={() => setOpen(true)}
        placeholder="ชื่อหรือรายละเอียดสินค้า"
        startIcon={<Search />}
        wrapperClassName="mt-3 h-12"
        role="combobox"
        aria-expanded={visible}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          visible && active >= 0 ? `${listId}-${active}` : undefined
        }
      />

      {visible && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-2 w-full overflow-hidden rounded-r3 border border-n-200 bg-white py-1 shadow-sh2"
        >
          {suggestions.map((product, index) => (
            <li key={product.id} id={`${listId}-${index}`} role="option" aria-selected={index === active}>
              <button
                type="button"
                // pointerdown fires before the input's blur, so the dismissal
                // listener cannot close the list out from under the click.
                onPointerDown={(event) => {
                  event.preventDefault()
                  choose(product)
                }}
                onMouseEnter={() => setActive(index)}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left ${
                  index === active ? "bg-n-100" : "bg-white"
                }`}
              >
                <ProductImage
                  src={product.images[0]?.url}
                  alt=""
                  className="size-10 shrink-0 rounded-r2"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">
                    {product.title}
                  </span>
                  <span className="block text-xs text-n-500">
                    {formatTHB(product.price)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

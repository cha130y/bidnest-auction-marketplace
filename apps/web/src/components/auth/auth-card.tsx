import Link from "next/link"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * AUTH-001 / AUTH-002 — the shell every account screen sits in.
 *
 * The rest of the site is white cards on `bg-n-100`, with the gavel mark,
 * `font-display` headings and amber as the one accent. The account screens
 * were bare forms on the page background using shadcn's default palette —
 * `text-muted-foreground`, `text-destructive` — so signing in looked like a
 * different product from the one you were signing in to. Sign-in is where
 * trust is decided, which makes it the worst page to look unfamiliar on.
 *
 * The mark links home on purpose: someone who arrived at a sign-in wall they
 * did not ask for needs a way back that is not the browser's back button.
 */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
  className
}: {
  title: string
  subtitle?: string
  children: ReactNode
  /** Sits outside the card, where "no account yet?" belongs. */
  footer?: ReactNode
  className?: string
}) {
  return (
    <main
      className={cn(
        "mx-auto flex w-full max-w-115 flex-col px-4 py-10 md:py-16",
        className
      )}
    >
      <Link
        href="/"
        className="mx-auto mb-8 flex items-center gap-2 rounded-r2 font-display text-2xl font-bold text-ink outline-none focus-visible:ring-3 focus-visible:ring-amber-500/30"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="size-8 text-amber-500"
          aria-hidden
        >
          <path d="M3 6l9 12 9-12M8 6l4 5 4-5" />
        </svg>
        BidNest
      </Link>

      <div className="rounded-r4 bg-white px-6 py-8 shadow-sh2 md:px-8">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink md:text-3xl">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-2 text-sm leading-relaxed text-n-600">
              {subtitle}
            </p>
          )}
        </div>

        {children}
      </div>

      {footer && (
        <div className="mt-6 text-center text-sm text-n-600">{footer}</div>
      )}
    </main>
  )
}

/**
 * The one link style these screens use, so "ลืมรหัสผ่าน" and "สมัครสมาชิก"
 * cannot drift apart. Underlined rather than colour-only: colour alone is not
 * an affordance, and amber on white is the weakest contrast on the page.
 */
export function AuthLink({
  href,
  children,
  className
}: {
  href: string
  children: ReactNode
  className?: string
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-r1 font-semibold text-ink underline decoration-n-300 underline-offset-4 transition-colors outline-none hover:decoration-amber-500 focus-visible:ring-3 focus-visible:ring-amber-500/30",
        className
      )}
    >
      {children}
    </Link>
  )
}

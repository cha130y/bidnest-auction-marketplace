import Link from "next/link"
import { Bell, LogIn, Menu, ShoppingCart } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { GavelNav, GavelNavMobile } from "@/components/layout/gavel-nav"

export type SiteHeaderProps = {
  cartCount?: number
  hasNotifications?: boolean
  onMenuToggle?: () => void
  className?: string
}

/**
 * Shared storefront header: logo, gavel-animated Auction/E-commerce nav;
 * logo + menu trigger on mobile. Presentational only — wire auth state,
 * cart count, notifications, and the mobile drawer at the call site.
 */
function SiteHeader({
  cartCount = 0,
  hasNotifications = false,
  onMenuToggle,
  className,
}: SiteHeaderProps) {
  return (
    <header className={cn("w-full", className)}>
      <div className="mx-auto max-w-330 px-4 py-4 md:px-6 md:py-6">
        <div className="flex items-center gap-4 rounded-r4 bg-white px-4 py-4 shadow-sh2 md:gap-6 md:px-6 md:py-5">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2 font-display text-xl font-bold text-ink md:text-2xl"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="size-7 text-amber-500"
            >
              <path d="M3 6l9 12 9-12M8 6l4 5 4-5" />
            </svg>
            BidNest
          </Link>

          <GavelNav />

          <div className="ml-auto flex items-center gap-2 md:gap-3">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Notifications"
              className="relative text-ink"
            >
              <Bell className="size-6" />
              {hasNotifications && (
                <span className="absolute top-2.25 right-2.75 size-2.25 rounded-full border-2 border-white bg-red" />
              )}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              aria-label="Cart"
              className="relative text-ink"
            >
              <ShoppingCart className="size-6" />
              {cartCount > 0 && (
                <span className="absolute top-1 right-1 flex h-5 min-w-5 items-center justify-center rounded-[7px] border-2 border-white bg-linear-to-b from-amber-400 to-amber-500 px-1 text-[11px] font-extrabold text-ink shadow-sh1">
                  {cartCount > 9 ? "9+" : cartCount}
                </span>
              )}
            </Button>

            <span className="hidden h-7 w-px bg-n-200 md:block" />

            <Button
              variant="primary"
              size="sm"
              className="hidden md:inline-flex"
              nativeButton={false}
              render={<Link href="/login" />}
            >
              <LogIn />
              Log in
            </Button>

            <button
              type="button"
              onClick={onMenuToggle}
              aria-label="Open menu"
              className="flex size-11 items-center justify-center rounded-r2 text-ink hover:bg-n-100 md:hidden"
            >
              <Menu className="size-6" />
            </button>
          </div>
        </div>

        <GavelNavMobile />
      </div>
    </header>
  )
}

export { SiteHeader }

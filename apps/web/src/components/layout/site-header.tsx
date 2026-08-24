import Link from "next/link"
import { Suspense, type ReactNode } from "react"
import { Bell, Menu, ShoppingCart } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { AccountMenu } from "@/components/auth/account-menu"
import { GavelNav, GavelNavMobile } from "@/components/layout/gavel-nav"

export type SiteHeaderProps = {
  cartCount?: number
  hasNotifications?: boolean
  onMenuToggle?: () => void
  /**
   * The account control at the right-hand end. Defaults to the live one, so
   * every page that renders `<SiteHeader />` bare gets it; pass something else
   * where a fixed state is wanted, such as a component gallery.
   */
  account?: ReactNode
  className?: string
}

/**
 * Shared storefront header: logo, gavel-animated Auction/E-commerce nav;
 * logo + menu trigger on mobile. Presentational apart from the account
 * control, which reads the session itself — it is the same on every page,
 * and threading it through six call sites would only be a longer way of
 * saying so. Cart count, notifications and the mobile drawer are still
 * wired from outside.
 */
function SiteHeader({
  cartCount = 0,
  hasNotifications = false,
  onMenuToggle,
  account = <AccountMenu />,
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
              nativeButton={false}
              render={<Link href="/notifications" />}
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
              nativeButton={false}
              render={<Link href="/cart" />}
            >
              <ShoppingCart className="size-6" />
              {cartCount > 0 && (
                <span className="absolute top-1 right-1 flex h-5 min-w-5 items-center justify-center rounded-[7px] border-2 border-white bg-linear-to-b from-amber-400 to-amber-500 px-1 text-[11px] font-extrabold text-ink shadow-sh1">
                  {cartCount > 9 ? "9+" : cartCount}
                </span>
              )}
            </Button>

            <span className="hidden h-7 w-px bg-n-200 md:block" />

            {/*
              The account control reads the current URL to know where to send
              someone back to after signing in, and Next wants a boundary
              around that so the pages using this header can still prerender.
              The fallback holds the same space the control will take.
            */}
            <Suspense fallback={<div className="h-11 w-11 md:w-28" />}>
              {account}
            </Suspense>

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

import Link from "next/link"
import type { ReactNode } from "react"
import {
  Bell,
  Camera,
  Gamepad2,
  Headphones,
  LogIn,
  Menu,
  Monitor,
  ShoppingCart,
  Smartphone,
  Watch,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { GavelNav, GavelNavMobile } from "@/components/layout/gavel-nav"

export type CategoryLink = {
  label: string
  href: string
  icon: ReactNode
}

export const defaultCategories: CategoryLink[] = [
  { label: "Phones", href: "/shop?category=phones", icon: <Smartphone /> },
  { label: "Computers", href: "/shop?category=computers", icon: <Monitor /> },
  { label: "Watches", href: "/shop?category=watches", icon: <Watch /> },
  { label: "Cameras", href: "/shop?category=cameras", icon: <Camera /> },
  {
    label: "Headphones",
    href: "/shop?category=headphones",
    icon: <Headphones />,
  },
  { label: "Gaming", href: "/shop?category=gaming", icon: <Gamepad2 /> },
]

export type SiteHeaderProps = {
  categories?: CategoryLink[]
  cartCount?: number
  hasNotifications?: boolean
  onMenuToggle?: () => void
  className?: string
}

/**
 * Shared storefront header: logo, gavel-animated Auction/E-commerce nav +
 * category subnav on desktop; logo + menu trigger on mobile. Presentational
 * only — wire auth state, cart count, notifications, and the mobile drawer
 * at the call site.
 */
function SiteHeader({
  categories = defaultCategories,
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

        <nav className="mt-4 hidden flex-wrap justify-between gap-4 rounded-r3 bg-linear-to-b from-[#2b303b] to-ink px-6 py-4 md:flex">
          {categories.map((category) => (
            <Link
              key={category.href}
              href={category.href}
              className="flex items-center gap-2 text-sm text-white/75 transition-colors hover:text-amber-400 [&_svg]:size-4.5"
            >
              {category.icon}
              {category.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  )
}

export { SiteHeader }

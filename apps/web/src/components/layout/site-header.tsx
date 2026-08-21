import Link from "next/link"
import type { ReactNode } from "react"
import {
  Camera,
  Gamepad2,
  Headphones,
  Heart,
  Menu,
  Monitor,
  Search,
  ShoppingCart,
  Smartphone,
  User,
  Watch,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"

export type NavLink = {
  label: string
  href: string
}

export type CategoryLink = {
  label: string
  href: string
  icon: ReactNode
}

export const defaultNavLinks: NavLink[] = [
  { label: "Home", href: "/" },
  { label: "Auctions", href: "/auctions" },
  { label: "Shop", href: "/shop" },
  { label: "Blog", href: "/blog" },
]

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
  navLinks?: NavLink[]
  activeHref?: string
  categories?: CategoryLink[]
  cartCount?: number
  wishlistActive?: boolean
  onMenuToggle?: () => void
  className?: string
}

/**
 * Shared storefront header: logo, search, primary nav + category subnav on
 * desktop; logo + menu trigger on mobile. Presentational only — wire auth
 * state, cart count, and the mobile drawer at the call site.
 */
function SiteHeader({
  navLinks = defaultNavLinks,
  activeHref = "/",
  categories = defaultCategories,
  cartCount = 0,
  wishlistActive = false,
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

          <Input
            pill
            type="search"
            placeholder="Search auctions & products"
            startIcon={<Search />}
            wrapperClassName="hidden h-12 max-w-[520px] flex-1 md:flex"
          />

          <nav className="ml-auto hidden items-center gap-6 md:flex">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "text-base font-medium text-n-500 transition-colors hover:text-ink",
                  link.href === activeHref && "font-semibold text-ink"
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-5 text-ink md:flex">
            <Heart
              className={cn(
                "size-6 cursor-pointer",
                wishlistActive
                  ? "fill-amber-500 text-amber-500"
                  : "text-ink"
              )}
            />
            <span className="relative cursor-pointer">
              <ShoppingCart className="size-6" />
              {cartCount > 0 && (
                <span className="absolute -top-2 -right-2 flex size-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-ink">
                  {cartCount > 9 ? "9+" : cartCount}
                </span>
              )}
            </span>
            <User className="size-6 cursor-pointer" />
          </div>

          <button
            type="button"
            onClick={onMenuToggle}
            aria-label="Open menu"
            className="ml-auto flex items-center justify-center text-ink md:hidden"
          >
            <Menu className="size-6" />
          </button>
        </div>

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

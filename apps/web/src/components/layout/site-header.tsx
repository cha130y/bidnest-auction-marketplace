import Image from "next/image"
import Link from "next/link"
import { Suspense, type ReactNode } from "react"
import { Bell, Heart, Menu, ShoppingCart } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { AccountMenu } from "@/components/auth/account-menu"
import { GavelNav, GavelNavMobile } from "@/components/layout/gavel-nav"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from "@/components/ui/sheet"

/** Shared by the notification, watchlist and cart badges so none can drift apart. */
const BADGE_CLASS =
  "absolute top-1 right-1 flex h-5 min-w-5 items-center justify-center rounded-[7px] border-2 border-white bg-linear-to-b from-amber-400 to-amber-500 px-1 text-[11px] font-extrabold text-ink shadow-sh1"

/** A badge never grows past two digits — three would not fit the pill. */
function badgeLabel(count: number) {
  return count > 99 ? "99+" : String(count)
}

/** Row inside the mobile menu: icon, label and its own badge. */
const MOBILE_ITEM_CLASS =
  "flex items-center gap-3 rounded-r2 px-3 py-3 text-sm font-semibold text-ink no-underline outline-none select-none hover:bg-n-100 [&_svg]:size-5 [&_svg]:text-n-500"

export type SiteHeaderProps = {
  cartCount?: number
  watchlistCount?: number
  /** Unread notification count — one number covers auction and marketplace alike. */
  notificationCount?: number
  /**
   * Signed in or not. Signed out, the notification/watchlist/cart icons send
   * the visitor to `/login` instead of a page that would 401 on them anyway.
   */
  isAuthenticated?: boolean
  /**
   * The account control at the right-hand end. Defaults to the live one, so
   * every page that renders `<SiteHeader />` bare gets it; pass something else
   * where a fixed state is wanted, such as a component gallery.
   */
  account?: ReactNode
  className?: string
}

/**
 * Shared storefront header: logo, gavel-animated Auction/Marketplace nav;
 * logo + menu trigger on mobile. Presentational apart from the account
 * control, which reads the session itself — it is the same on every page,
 * and threading it through six call sites would only be a longer way of
 * saying so. Cart count, notifications and the mobile drawer are still
 * wired from outside.
 */
function SiteHeader({
  cartCount = 0,
  watchlistCount = 0,
  notificationCount = 0,
  isAuthenticated = false,
  account = <AccountMenu />,
  className,
}: SiteHeaderProps) {
  // Signed out, these three have nothing of the visitor's own to show — send
  // them to sign in rather than a page that would 401 right back at them.
  const notificationsHref = isAuthenticated ? "/notifications" : "/login"
  const watchlistHref = isAuthenticated ? "/watchlist" : "/login"
  const cartHref = isAuthenticated ? "/cart" : "/login"

  return (
    <header className={cn("w-full", className)}>
      <div className="mx-auto max-w-330 px-4 py-4 md:px-6 md:py-6">
        <div className="flex items-center gap-4 rounded-r4 bg-white px-4 py-4 shadow-sh2 md:gap-6 md:px-6 md:py-5">
          <Link href="/" className="flex shrink-0 items-center">
            <Image
              src="/logo.jpg"
              alt="BidNest"
              width={1160}
              height={730}
              priority
              className="h-9 w-auto md:h-11"
            />
          </Link>

          <GavelNav />

          <div className="ml-auto flex items-center gap-2 md:gap-3">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Watchlist"
              className="relative hidden text-ink lg:inline-flex"
              nativeButton={false}
              render={<Link href={watchlistHref} />}
            >
              <Heart className="size-6" />
              {isAuthenticated && watchlistCount > 0 && (
                <span className={BADGE_CLASS}>{badgeLabel(watchlistCount)}</span>
              )}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              aria-label="Notifications"
              className="relative hidden text-ink lg:inline-flex"
              nativeButton={false}
              render={<Link href={notificationsHref} />}
            >
              <Bell className="size-6" />
              {isAuthenticated && notificationCount > 0 && (
                <span className={BADGE_CLASS}>{badgeLabel(notificationCount)}</span>
              )}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              aria-label="Cart"
              className="relative hidden text-ink lg:inline-flex"
              nativeButton={false}
              render={<Link href={cartHref} />}
            >
              <ShoppingCart className="size-6" />
              {isAuthenticated && cartCount > 0 && (
                <span className={BADGE_CLASS}>{badgeLabel(cartCount)}</span>
              )}
            </Button>

            <span className="hidden h-7 w-px bg-n-200 lg:block" />

            {/*
              The account control reads the current URL to know where to send
              someone back to after signing in, and Next wants a boundary
              around that so the pages using this header can still prerender.
              The fallback holds the same space the control will take.
            */}
            <Suspense fallback={<div className="h-11 w-11 md:w-28" />}>
              {account}
            </Suspense>

            {/*
              Hidden from `lg` up only: the three icons above stay hidden
              until then too. `md` looked right in isolation, but logo + nav
              + three icons + the account control do not actually fit in the
              768–1023px band — the account trigger ran past the card's edge
              there. Below `lg` they move in here instead of disappearing — a
              drawer with a label reads better on a narrow-to-medium screen
              than a row of bare icons would have.
            */}
            <Sheet>
              <SheetTrigger
                render={
                  <button
                    type="button"
                    aria-label="Open menu"
                    className="flex size-11 items-center justify-center rounded-r2 text-ink hover:bg-n-100 lg:hidden"
                  />
                }
              >
                <Menu className="size-6" />
              </SheetTrigger>
              <SheetContent side="right">
                <SheetHeader>
                  <SheetTitle>เมนู</SheetTitle>
                </SheetHeader>
                <nav className="flex flex-col gap-1 px-2">
                  <SheetClose
                    render={<Link href={notificationsHref} />}
                    nativeButton={false}
                    className={MOBILE_ITEM_CLASS}
                  >
                    <Bell />
                    แจ้งเตือน
                    {isAuthenticated && notificationCount > 0 && (
                      <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-[7px] bg-linear-to-b from-amber-400 to-amber-500 px-1 text-[11px] font-extrabold text-ink">
                        {badgeLabel(notificationCount)}
                      </span>
                    )}
                  </SheetClose>
                  <SheetClose
                    render={<Link href={watchlistHref} />}
                    nativeButton={false}
                    className={MOBILE_ITEM_CLASS}
                  >
                    <Heart />
                    รายการที่ติดตาม
                    {isAuthenticated && watchlistCount > 0 && (
                      <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-[7px] bg-linear-to-b from-amber-400 to-amber-500 px-1 text-[11px] font-extrabold text-ink">
                        {badgeLabel(watchlistCount)}
                      </span>
                    )}
                  </SheetClose>
                  <SheetClose
                    render={<Link href={cartHref} />}
                    nativeButton={false}
                    className={MOBILE_ITEM_CLASS}
                  >
                    <ShoppingCart />
                    ตะกร้า
                    {isAuthenticated && cartCount > 0 && (
                      <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-[7px] bg-linear-to-b from-amber-400 to-amber-500 px-1 text-[11px] font-extrabold text-ink">
                        {badgeLabel(cartCount)}
                      </span>
                    )}
                  </SheetClose>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        <GavelNavMobile />
      </div>
    </header>
  )
}

export { SiteHeader }

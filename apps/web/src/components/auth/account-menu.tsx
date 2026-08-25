"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { Menu } from "@base-ui/react/menu"
import { signOut, useSession } from "next-auth/react"
import {
  ChevronDown,
  Gavel,
  Heart,
  LogIn,
  LogOut,
  Package,
  Shield,
  User
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * AUTH-002 / AUTH-008 — who is signed in, in the header.
 *
 * Signed out it is the Log in button that was here before, and signed in it is
 * the account's name over a menu. Both are the same control in the same place,
 * so the header never loses its right-hand end at any width — the old button
 * was `hidden md:inline-flex`, which left a phone with no way in at all, since
 * the menu trigger beside it is not wired to anything yet.
 *
 * The name shows from `lg` up, not `md`. Measured at 800px wide the header
 * needs 767px of a 737px row, and the part hanging off the right-hand end is
 * this control — the logo will not shrink, and the gavel nav bottoms out once
 * "E-commerce" has wrapped. Between those two breakpoints the avatar circle
 * stands alone; the name and address are still a tap away inside the menu, and
 * the hit area stays a full 44px either way.
 */

type MenuLink = {
  href: string
  label: string
  icon: typeof User
  /** Rendered only for an admin. */
  adminOnly?: boolean
}

const LINKS: MenuLink[] = [
  { href: "/profile", label: "โปรไฟล์", icon: User },
  { href: "/orders", label: "คำสั่งซื้อของฉัน", icon: Package },
  { href: "/watchlist", label: "รายการที่ติดตาม", icon: Heart },
  { href: "/sell", label: "ขายสินค้า", icon: Gavel },
  { href: "/admin", label: "ผู้ดูแลระบบ", icon: Shield, adminOnly: true }
]

const ITEM_CLASS =
  "flex cursor-pointer items-center gap-2.5 rounded-r2 px-3 py-2.5 text-sm text-ink no-underline outline-none select-none data-highlighted:bg-n-100 [&_svg]:size-4.5 [&_svg]:text-n-500"

/** The initial on the avatar; falls back to the address when there is no name. */
function initialOf(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.trim() || "?"
  return source.charAt(0).toUpperCase()
}

export function AccountMenu({ className }: { className?: string }) {
  const { data: session, status } = useSession()
  const pathname = usePathname()
  const search = useSearchParams().toString()

  // Reserve the space while the session resolves, so the header does not shift
  // under the pointer a moment after it paints.
  if (status === "loading") {
    return <div className={cn("h-11 w-11 lg:w-28", className)} aria-hidden />
  }

  if (!session?.accessToken) {
    // Come back to whatever they were looking at, the same way proxy.ts does
    // when it turns someone away from a signed-in route.
    const here = search ? `${pathname}?${search}` : pathname
    const href =
      pathname === "/"
        ? "/login"
        : `/login?callbackUrl=${encodeURIComponent(here)}`

    return (
      <Button
        variant="primary"
        size="sm"
        className={cn("px-3 md:px-4", className)}
        nativeButton={false}
        render={<Link href={href} />}
      >
        <LogIn />
        <span className="hidden sm:inline">Log in</span>
      </Button>
    )
  }

  const name = session.user?.name ?? session.user?.email ?? "บัญชีของฉัน"
  const isAdmin = session.role === "ADMIN"

  return (
    <Menu.Root>
      <Menu.Trigger
        className={cn(
          "flex h-11 shrink-0 items-center gap-2 rounded-r2 px-1.5 text-ink outline-none transition-colors hover:bg-n-100 focus-visible:ring-3 focus-visible:ring-amber-500/30 data-popup-open:bg-n-100 md:px-2",
          className
        )}
        aria-label={`บัญชี: ${name}`}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-linear-to-b from-amber-400 to-amber-500 text-sm font-bold text-ink">
          {initialOf(session.user?.name, session.user?.email)}
        </span>
        <span className="hidden max-w-32 truncate text-sm font-semibold lg:inline">
          {name}
        </span>
        <ChevronDown className="hidden size-4 shrink-0 text-n-500 lg:block" />
      </Menu.Trigger>

      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={8} className="z-50">
          <Menu.Popup className="min-w-56 origin-(--transform-origin) rounded-r3 bg-white p-1.5 shadow-sh2 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
            <div className="px-3 py-2">
              <p className="truncate text-sm font-semibold text-ink">{name}</p>
              {session.user?.email && (
                <p className="truncate text-xs text-n-500">
                  {session.user.email}
                </p>
              )}
            </div>

            <Menu.Separator className="my-1 h-px bg-n-200" />

            {LINKS.filter((link) => !link.adminOnly || isAdmin).map((link) => (
              <Menu.LinkItem
                key={link.href}
                closeOnClick
                className={ITEM_CLASS}
                render={<Link href={link.href} />}
              >
                <link.icon />
                {link.label}
              </Menu.LinkItem>
            ))}

            <Menu.Separator className="my-1 h-px bg-n-200" />

            <Menu.Item
              className={cn(ITEM_CLASS, "text-red [&_svg]:text-red")}
              // Home rather than back where they were: half the signed-in
              // routes would only bounce them to the login page.
              onClick={() => void signOut({ callbackUrl: "/" })}
            >
              <LogOut />
              ออกจากระบบ
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}

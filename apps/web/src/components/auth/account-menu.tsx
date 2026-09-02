"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { Menu } from "@base-ui/react/menu"
import { useQuery } from "@tanstack/react-query"
import { signOut, useSession } from "next-auth/react"
import {
  ChevronDown,
  Gavel,
  Heart,
  LogIn,
  LogOut,
  Package,
  Shield,
  Store,
  User
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { getMyProfile, myProfileQueryKey } from "@/lib/api/users"
import { initialOf } from "@/lib/format"
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
 * On a narrow screen the label drops away and the avatar circle stands alone;
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
  // Two ways to sell, and this menu was the only way in to either. Both now
  // point at the list rather than the form: a seller coming back here is far
  // more often looking for something they already have than starting another
  // one, and both lists carry the button that starts one. It also makes the
  // two halves symmetrical — "/sell/auctions" and "/sell/products", with
  // "/sell" and "/sell/products/new" as the forms behind them.
  { href: "/sell/auctions", label: "การประมูลของฉัน", icon: Gavel },
  { href: "/sell/products", label: "ขายสินค้า", icon: Store },
  { href: "/admin", label: "ผู้ดูแลระบบ", icon: Shield, adminOnly: true }
]

const ITEM_CLASS =
  "flex cursor-pointer items-center gap-2.5 rounded-r2 px-3 py-2.5 text-sm text-ink no-underline outline-none select-none data-highlighted:bg-n-100 [&_svg]:size-4.5 [&_svg]:text-n-500"

// initialOf now lives in lib/format: the profile form draws the same circle
// for the same account, and two copies of this would be two ways to spell one
// person's initial.

export function AccountMenu({ className }: { className?: string }) {
  const { data: session, status } = useSession()
  const pathname = usePathname()
  const search = useSearchParams().toString()

  /**
   * USR-001 — the picture, taken from the account rather than the session.
   *
   * The session carries one too, and it used to be what this drew. But that is
   * a copy, kept in step by writing to it every time the profile is saved —
   * and a copy that has to be maintained is a copy that can be wrong. On
   * production it was: the account held the picture just uploaded, the session
   * still held the one before it, and no reload would shift it.
   *
   * This is the same cache entry the profile page reads and writes, so saving
   * a picture redraws the header in the same tick, with no round trip and
   * nothing left to keep in step. The session's copy is still the first thing
   * drawn, which is what stops the circle showing an initial for a moment on
   * every page load.
   */
  const { data: profile } = useQuery({
    queryKey: myProfileQueryKey,
    queryFn: getMyProfile,
    enabled: Boolean(session?.accessToken),
    // This header is on every page, so it must not cost a request per
    // navigation. Well past the 30s default, and still short enough that a
    // picture changed on another device catches up on its own.
    staleTime: 5 * 60_000,
    // A 401 will not fix itself by trying again, and a missing picture is not
    // worth three attempts.
    retry: false
  })

  // Reserve the space while the session resolves, so the header does not shift
  // under the pointer a moment after it paints.
  if (status === "loading") {
    return <div className={cn("h-11 w-11 md:w-28", className)} aria-hidden />
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

  /**
   * USR-001 — the name, on exactly the terms the picture above is on, and for
   * the reason given there: the session's copy is maintained by writing to it
   * on every save, and a copy that has to be maintained can be wrong. It was.
   * Renaming yourself left the header showing the old name until a fresh
   * sign-in, which is the same failure the picture had before it stopped
   * reading from the session.
   *
   * Reading it from the cache the profile page writes on save means the header
   * redraws in the same tick, with no round trip and nothing to keep in step.
   * The session's copy still comes first on a cold load, so the name does not
   * flash in after the page paints.
   */
  const accountName = profile?.profile.displayName ?? session.user?.name
  const name = accountName ?? session.user?.email ?? "บัญชีของฉัน"
  const avatarUrl = profile?.profile.avatarUrl ?? session.user?.image ?? null
  const isAdmin = session.role === "ADMIN"

  return (
    <Menu.Root>
      <Menu.Trigger
        className={cn(
          "flex h-11 items-center gap-2 rounded-r2 px-1.5 text-ink outline-none transition-colors hover:bg-n-100 focus-visible:ring-3 focus-visible:ring-amber-500/30 data-popup-open:bg-n-100 lg:border lg:border-n-200 lg:bg-white lg:px-2 lg:shadow-sh1 lg:transition-shadow lg:hover:bg-n-100 lg:hover:shadow-sh2 lg:data-popup-open:shadow-sh2",
          className
        )}
        aria-label={`บัญชี: ${name}`}
      >
        {avatarUrl ? (
          // A plain <img> for the reason ProductImage gives: avatarUrl has no
          // host allowlist, so next/image would need remotePatterns open to
          // the whole internet to match it.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt=""
            className="size-8 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-linear-to-b from-amber-400 to-amber-500 text-sm font-bold text-ink">
            {initialOf(accountName, session.user?.email)}
          </span>
        )}
        <span className="hidden max-w-32 truncate text-sm font-semibold lg:inline">
          {name}
        </span>
        <ChevronDown className="hidden size-4 text-n-500 lg:block" />
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

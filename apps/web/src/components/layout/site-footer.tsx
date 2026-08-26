import Image from "next/image"
import Link from "next/link"

import { cn } from "@/lib/utils"
import { FooterSocialLinks } from "@/components/layout/footer-social-links"

export type FooterLinkGroup = {
  title: string
  links: { label: string; href: string }[]
}

/**
 * Every href here is a route that actually exists — the previous list
 * pointed half its links at pages that were never built (`/how-it-works`,
 * `/fees`, `/support/*`, `/terms`), so "read more" and "get help" both led
 * to a 404. These are what's real today: browsing/selling on the left,
 * the signed-in account pages on the right.
 */
export const defaultFooterGroups: FooterLinkGroup[] = [
  {
    title: "Marketplace",
    links: [
      { label: "Live auctions", href: "/auctions" },
      { label: "Buy now", href: "/shop" },
      { label: "Watchlist", href: "/watchlist" },
      { label: "Start an auction", href: "/sell" },
      { label: "Sell products", href: "/sell/products" },
    ],
  },
  {
    title: "My account",
    links: [
      { label: "My orders", href: "/orders" },
      { label: "Selling orders", href: "/sell/orders" },
      { label: "Cart", href: "/cart" },
      { label: "Messages", href: "/chat" },
      { label: "Notifications", href: "/notifications" },
    ],
  },
]

export type SiteFooterProps = {
  description?: string
  groups?: FooterLinkGroup[]
  className?: string
}

/** Shared storefront footer: brand blurb + socials, plus link groups. */
function SiteFooter({
  description = "A combined auction & e-commerce marketplace. Bid live on the things you love, or buy them now.",
  groups = defaultFooterGroups,
  className,
}: SiteFooterProps) {
  return (
    <footer className={cn("w-full", className)}>
      <div className="mx-auto max-w-330 px-4 py-6 md:px-6 md:py-8">
        <div className="flex flex-col items-center gap-10 rounded-r4 bg-white px-6 py-10 text-center shadow-sh2 md:flex-row md:flex-wrap md:items-start md:justify-center md:gap-20 md:px-10 md:py-12 md:text-left">
          <div className="max-w-80">
            <Link href="/" className="flex items-center justify-center md:justify-start">
              <Image
                src="/logo.jpg"
                alt="BidNest"
                width={1160}
                height={730}
                className="h-10 w-auto"
              />
            </Link>
            <p className="mt-5 text-[15px] leading-relaxed text-n-500">
              {description}
            </p>
            <FooterSocialLinks />
          </div>

          <div className="flex flex-col items-center gap-10 md:flex-row md:items-start md:gap-16">
            {groups.map((group) => (
              <div key={group.title}>
                <h4 className="font-display text-[17px] font-semibold text-ink">
                  {group.title}
                </h4>
                <ul className="mt-5 flex flex-col gap-4">
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-[15px] text-n-500 transition-colors hover:text-ink"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}

export { SiteFooter }

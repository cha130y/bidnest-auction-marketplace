import Link from "next/link"
import type { ReactNode, SVGProps } from "react"

import { cn } from "@/lib/utils"

export type FooterLinkGroup = {
  title: string
  links: { label: string; href: string }[]
}

export const defaultFooterGroups: FooterLinkGroup[] = [
  {
    title: "Marketplace",
    links: [
      { label: "Live auctions", href: "/auctions" },
      { label: "Buy now", href: "/shop" },
      { label: "Watchlist", href: "/watchlist" },
      { label: "Sell an item", href: "/sell" },
      { label: "How bidding works", href: "/how-it-works" },
      { label: "Fees", href: "/fees" },
    ],
  },
  {
    title: "Support",
    links: [
      { label: "Track an order", href: "/orders" },
      { label: "Delivery & returns", href: "/support/delivery" },
      { label: "Buyer protection", href: "/support/protection" },
      { label: "Payments", href: "/support/payments" },
      { label: "FAQ", href: "/support/faq" },
      { label: "Terms of use", href: "/terms" },
    ],
  },
]

function IconTwitter(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M23 5a8 8 0 01-2.3.6A4 4 0 0022.4 3a8 8 0 01-2.5 1A4 4 0 0013 7.5a11 11 0 01-8-4 4 4 0 001.2 5.3A4 4 0 013 8.3a4 4 0 003.2 4 4 4 0 01-1.8.1 4 4 0 003.7 2.8A8 8 0 012 17a11 11 0 006 1.8c7.2 0 11.1-6 11.1-11.1v-.5A8 8 0 0023 5z" />
    </svg>
  )
}

function IconFacebook(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z" />
    </svg>
  )
}

function IconTikTok(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M16 2a5 5 0 005 5v3a8 8 0 01-5-1.7V15a6 6 0 11-6-6v3a3 3 0 103 3V2z" />
    </svg>
  )
}

function IconInstagram(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      {...props}
    >
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
    </svg>
  )
}

const socialLinks: { label: string; href: string; icon: ReactNode }[] = [
  { label: "Twitter", href: "#", icon: <IconTwitter className="size-4.5" /> },
  { label: "Facebook", href: "#", icon: <IconFacebook className="size-4.5" /> },
  { label: "TikTok", href: "#", icon: <IconTikTok className="size-4.5" /> },
  {
    label: "Instagram",
    href: "#",
    icon: <IconInstagram className="size-4.5" />,
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
        <div className="flex flex-col items-center gap-10 rounded-r4 bg-white px-6 py-10 text-center shadow-sh2 md:flex-row md:flex-wrap md:items-start md:gap-16 md:px-10 md:py-12 md:text-left">
          <div className="max-w-80">
            <Link
              href="/"
              className="flex items-center justify-center gap-2 font-display text-xl font-bold text-ink md:justify-start"
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
            <p className="mt-5 text-[15px] leading-relaxed text-n-500">
              {description}
            </p>
            <div className="mt-8 flex justify-center gap-4 md:justify-start">
              {socialLinks.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  aria-label={social.label}
                  className="flex size-10 items-center justify-center rounded-full bg-n-100 text-ink transition-colors hover:bg-amber-500 hover:text-ink"
                >
                  {social.icon}
                </a>
              ))}
            </div>
          </div>

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
    </footer>
  )
}

export { SiteFooter }

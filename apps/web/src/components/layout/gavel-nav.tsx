"use client"

import { useLayoutEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Gavel, ShoppingCart } from "lucide-react"

import { cn } from "@/lib/utils"

const TABS = [
  { label: "Auction", href: "/auctions", icon: Gavel },
  { label: "Marketplace", href: "/shop", icon: ShoppingCart },
] as const

/**
 * `null` off an allowlist — home, watchlist, notifications, cart and every
 * other page outside `/auctions` and `/shop` are not "Auction" or
 * "Marketplace" just because they aren't `/shop`, so no tab lights up or
 * carries the gavel there. Hovering still previews it regardless.
 */
function useActiveTabIndex(): number | null {
  const pathname = usePathname() ?? ""
  if (pathname.startsWith("/auctions")) return 0
  if (pathname.startsWith("/shop")) return 1
  return null
}

/**
 * Desktop primary nav: an animated gavel tracks the hovered tab, cocks back,
 * then strikes down on click. Auction / Marketplace only — active tab is
 * derived from the route, not a prop, so it stays correct across navigation.
 */
function GavelNav() {
  const activeIndex = useActiveTabIndex()

  const railRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([])
  const [centers, setCenters] = useState<number[]>([])
  const [ready, setReady] = useState(false)
  const [hover, setHover] = useState<number | null>(null)
  const [striking, setStriking] = useState(false)
  const [struck, setStruck] = useState<number | null>(null)

  useLayoutEffect(() => {
    function measure() {
      const rail = railRef.current
      if (!rail) return
      const railBox = rail.getBoundingClientRect()
      if (railBox.width === 0) return
      setCenters(
        itemRefs.current.map((el) => {
          if (!el) return 0
          const box = el.getBoundingClientRect()
          return box.left - railBox.left + box.width / 2
        })
      )
      setReady(true)
    }
    measure()
    window.addEventListener("resize", measure)
    const timers = [setTimeout(measure, 120), setTimeout(measure, 400)]
    return () => {
      window.removeEventListener("resize", measure)
      timers.forEach(clearTimeout)
    }
  }, [])

  const target = hover ?? activeIndex
  const cocked = hover !== null && hover !== activeIndex

  function handleClick(index: number) {
    setStriking(true)
    setStruck(index)
    setTimeout(() => setStruck(null), 500)
  }

  return (
    <nav className="relative hidden md:block">
      <div ref={railRef} className="relative flex items-end gap-4.5 px-1">
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute -top-12 left-0 -ml-10.25 flex w-20.5 justify-center opacity-0 transition-[transform,opacity] duration-[460ms] ease-[cubic-bezier(0.5,0.05,0.2,1)]",
            ready && target !== null && "opacity-100"
          )}
          style={{
            transform: `translateX(${target !== null ? (centers[target] ?? 0) : 0}px)`
          }}
        >
          <div
            className="absolute top-8.5 -bottom-10.5 left-1/2 w-9.5 -ml-4.75 animate-beam-breathe blur-[2px]"
            style={{
              background:
                "radial-gradient(50% 90% at 50% 0%, rgba(251,185,74,.75) 0%, rgba(251,185,74,.24) 42%, rgba(251,185,74,0) 74%)",
              clipPath: "polygon(36% 0, 64% 0, 100% 100%, 0 100%)",
            }}
          />
          <div
            className={cn(
              "origin-[19%_73%] transition-transform duration-[260ms] ease-[cubic-bezier(0.34,1.56,0.64,1)]",
              striking && "animate-gavel-strike"
            )}
            style={
              !striking ? { transform: `rotate(${cocked ? -12 : 0}deg)` } : undefined
            }
            onAnimationEnd={() => setStriking(false)}
          >
            <svg width="82" height="72" viewBox="0 0 132 116" fill="none">
              <defs>
                <linearGradient id="gavelCream" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#FBF4E4" />
                  <stop offset="1" stopColor="#EAD6AE" />
                </linearGradient>
                <linearGradient id="gavelAmber" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#FCD34D" />
                  <stop offset="1" stopColor="#D97706" />
                </linearGradient>
              </defs>
              <line
                x1="64"
                y1="46"
                x2="25"
                y2="85"
                stroke="#4A3620"
                strokeWidth="20"
                strokeLinecap="round"
              />
              <line
                x1="64"
                y1="46"
                x2="25"
                y2="85"
                stroke="url(#gavelCream)"
                strokeWidth="12"
                strokeLinecap="round"
              />
              <line
                x1="61"
                y1="44"
                x2="29"
                y2="81"
                stroke="#FFFFFF"
                strokeOpacity="0.4"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <g transform="rotate(45 64 46)">
                <rect
                  x="31"
                  y="32"
                  width="66"
                  height="28"
                  rx="14"
                  fill="url(#gavelCream)"
                  stroke="#4A3620"
                  strokeWidth="5"
                  strokeLinejoin="round"
                />
                <rect
                  x="23"
                  y="28"
                  width="20"
                  height="36"
                  rx="10"
                  fill="url(#gavelAmber)"
                  stroke="#4A3620"
                  strokeWidth="5"
                  strokeLinejoin="round"
                />
                <rect
                  x="85"
                  y="28"
                  width="20"
                  height="36"
                  rx="10"
                  fill="url(#gavelAmber)"
                  stroke="#4A3620"
                  strokeWidth="5"
                  strokeLinejoin="round"
                />
                <rect
                  x="52"
                  y="36"
                  width="24"
                  height="5"
                  rx="2.5"
                  fill="#FFFFFF"
                  opacity="0.42"
                />
                <rect
                  x="30"
                  y="33"
                  width="4"
                  height="22"
                  rx="2"
                  fill="#FFFFFF"
                  opacity="0.4"
                />
                <rect
                  x="94"
                  y="33"
                  width="4"
                  height="22"
                  rx="2"
                  fill="#FFFFFF"
                  opacity="0.4"
                />
              </g>
            </svg>
          </div>
        </div>

        {TABS.map((tab, index) => {
          const active = index === activeIndex
          return (
            <Link
              key={tab.href}
              href={tab.href}
              ref={(el) => {
                itemRefs.current[index] = el
              }}
              onMouseEnter={() => setHover(index)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(index)}
              onBlur={() => setHover(null)}
              onClick={() => handleClick(index)}
              className="flex flex-col items-center gap-2.25 px-5.5 pt-6.5 pb-2 outline-none focus-visible:rounded-r2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-500"
            >
              <span
                className={cn(
                  "font-display text-base font-medium tracking-tight text-n-500 transition-colors",
                  active && "font-semibold text-ink"
                )}
              >
                {tab.label}
              </span>
              <span className="relative flex flex-col items-center gap-0.75">
                <span
                  className={cn(
                    "block h-1.25 w-6.5 rounded-full bg-n-200",
                    active &&
                      "border border-[#4A3620] bg-linear-to-b from-amber-300 to-amber-500",
                    struck === index && "animate-block-hit-top"
                  )}
                />
                <span
                  className={cn(
                    "block h-1.5 w-10.5 rounded-full bg-n-200",
                    active &&
                      "border border-[#4A3620] bg-linear-to-b from-amber-400 to-amber-600",
                    struck === index && "animate-block-hit-base"
                  )}
                />
                {struck === index && (
                  <span
                    aria-hidden
                    className="absolute top-1/2 left-1/2 -mt-8.25 size-16.5 -translate-x-1/2 animate-block-flash rounded-full"
                    style={{
                      background:
                        "radial-gradient(circle, var(--color-amber-300) 0%, rgba(251,185,74,.67) 30%, rgba(251,185,74,0) 68%)",
                    }}
                  />
                )}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

/**
 * Mobile fallback for the gavel nav (hidden from md up) — same segmented
 * track and tap targets as before, but the active state now reuses the
 * desktop nav's amber block motif instead of a solid dark fill, so the two
 * breakpoints read as one system. No gavel/strike animation here — hover
 * doesn't exist on touch, so it would only ever show mid-swing or not at all.
 */
function GavelNavMobile() {
  const activeIndex = useActiveTabIndex()

  return (
    <div
      role="tablist"
      aria-label="Browse"
      className="mt-4 flex w-full gap-0.5 rounded-r3 bg-n-100 p-1.25 shadow-well md:hidden"
    >
      {TABS.map((tab, index) => {
        const Icon = tab.icon
        const active = index === activeIndex
        return (
          <Link
            key={tab.href}
            href={tab.href}
            role="tab"
            aria-selected={active}
            className={cn(
              "flex flex-1 flex-col items-center gap-1.5 rounded-r2 py-2 transition-colors",
              active && "bg-white shadow-sh1"
            )}
          >
            <span
              className={cn(
                "flex items-center gap-1.5 text-sm font-semibold [&_svg]:size-4",
                active ? "text-ink" : "text-n-500"
              )}
            >
              <Icon />
              {tab.label}
            </span>
            <span className="flex flex-col items-center gap-0.5">
              <span
                className={cn(
                  "block h-1 w-5 rounded-full bg-n-200",
                  active &&
                    "border border-[#4A3620] bg-linear-to-b from-amber-300 to-amber-500"
                )}
              />
              <span
                className={cn(
                  "block h-1.25 w-8 rounded-full bg-n-200",
                  active &&
                    "border border-[#4A3620] bg-linear-to-b from-amber-400 to-amber-600"
                )}
              />
            </span>
          </Link>
        )
      })}
    </div>
  )
}

export { GavelNav, GavelNavMobile }

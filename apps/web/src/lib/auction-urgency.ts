import type { SuddenDeath } from "@/lib/api/types"

/**
 * How urgent the arena is, as one value rather than a pair of booleans that
 * could both be true.
 *
 * cbeave draws the same three, and the distinction is worth copying: being
 * inside the closing window and having *already had the deadline moved* mean
 * different things to somebody deciding whether to bid.
 *
 * - `calm` — nothing special; the auction has time.
 * - `closing` — inside the anti-sniping window, but nobody has bid into it
 *   yet. "There is very little time left" is the message.
 * - `suddenDeath` — the deadline has already been pushed back at least once,
 *   so bidding now is not a race against the clock but a thing that moves the
 *   clock. That is a different instruction, so it gets a different screen.
 *
 * Both signals come from the API — `active` from BID-004's own window and
 * `extensionCount` from the rows it wrote — so the moment the screen changes
 * is the moment the rule changes. Nothing here re-derives "two minutes".
 */
export type AuctionUrgency = "calm" | "closing" | "suddenDeath"

export function describeUrgency(suddenDeath: SuddenDeath): AuctionUrgency {
  if (suddenDeath.extensionCount > 0 && suddenDeath.active) return "suddenDeath"
  if (suddenDeath.active) return "closing"
  return "calm"
}

/**
 * The one place the urgent palette is written down.
 *
 * Every value is a Dev 1 token — `red`/`red-50` and `amber` — because the
 * design system gives red exactly two rungs, which is enough for a border, a
 * tint and text but not for a deep surface. If red ever gains the ramp amber
 * already has, this object is the only thing that changes.
 */
export const URGENCY_STYLE: Record<
  AuctionUrgency,
  { card: string; label: string; accent: string; countdown: string }
> = {
  calm: {
    card: "bg-white",
    label: "text-n-500",
    accent: "text-ink",
    countdown: "text-ink",
  },
  closing: {
    card: "bg-amber-50 ring-1 ring-amber-200",
    label: "text-amber-600",
    accent: "text-amber-600",
    countdown: "text-amber-600",
  },
  suddenDeath: {
    card: "bg-red-50 ring-1 ring-red",
    label: "text-red",
    accent: "text-red",
    countdown: "text-red",
  },
}

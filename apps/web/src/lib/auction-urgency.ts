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

/**
 * Note what `suddenDeath` does *not* test: `active`.
 *
 * It used to, and that was wrong in a way only a real extension shows. An
 * extension is measured from the old deadline — `newEndAt = currentEndAt +
 * ANTI_SNIPING_EXTENSION_MS`, see calculate-anti-sniping.util — and the window
 * and the extension are the same two minutes. So a bid that lands with 1:19
 * left pushes the end to 3:19 away, which is *outside* the window, and
 * `active` goes false the instant the extension is granted. Requiring it here
 * meant the screen dropped out of sudden death at the exact moment it entered
 * it, went white for the length of the extension, and only came back once the
 * clock had wound down again.
 *
 * Having been extended is a fact about the auction, not about this second of
 * it: from the first extension until it settles, every qualifying bid resets
 * the clock. cbeave holds its red the same way — its sudden-death panel is on
 * screen at 2m 39s remaining, well outside the window.
 *
 * `biddingOpen` is what ends it, and it is the API's own answer (AUC-005)
 * rather than a status compared here. A SCHEDULED auction has no urgency to
 * show, and one that has settled is a result, not a countdown.
 */
export function describeUrgency(
  suddenDeath: SuddenDeath,
  biddingOpen: boolean
): AuctionUrgency {
  if (!biddingOpen) return "calm"
  if (suddenDeath.extensionCount > 0) return "suddenDeath"
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

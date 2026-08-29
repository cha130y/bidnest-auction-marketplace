/**
 * AUC-001 / AUC-002 — how much of "the past" still counts as now when a seller
 * writes a schedule.
 *
 * A seller's form offers minutes, not seconds, so picking the current minute at
 * :45 already sends a time three quarters of a minute old before the request
 * leaves the browser — and the browser's clock and this one need not agree to
 * the second either. Refusing the past with no slack at all would therefore
 * reject the most ordinary thing a seller can ask for: start it right away.
 *
 * Five minutes is wide enough to cover all of that and still narrow enough to
 * catch what the rule is actually for — a date typed as last week, or a month
 * left over from a draft written in April.
 */
export const SCHEDULE_PAST_GRACE_MS = 5 * 60 * 1000;

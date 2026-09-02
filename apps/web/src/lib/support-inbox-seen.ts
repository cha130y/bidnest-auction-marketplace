/**
 * Per-browser "have I opened this since the last message" marker for a
 * support chat session's unread badge — used by both sides:
 *
 * - Admin sidebar (admin/layout.tsx): was counting every ESCALATED session
 *   regardless of whether an admin had already read/replied to it, so the
 *   badge stayed lit right after being handled and only cleared once the
 *   whole case was resolved outright.
 * - Customer widget (chat-widget.tsx): only ever set its red dot from a
 *   *live* socket event, so an admin reply that arrived while the tab was
 *   closed showed no badge at all on the next visit — there was no way to
 *   tell "unread" from "already seen" once the page reloaded.
 *
 * Both need the same thing: compare the newest message id against one this
 * browser has already viewed. Deliberately not server state — an admin and a
 * customer are essentially never the same physical browser, so one shared
 * localStorage key per (browser, session) is enough for both without a new
 * DB column/schema change.
 */
const KEY_PREFIX = 'bidnest_support_seen:';

export function getSeenMessageId(sessionId: string): string | null {
  try {
    return localStorage.getItem(KEY_PREFIX + sessionId);
  } catch {
    return null;
  }
}

export function markSessionSeen(sessionId: string, lastMessageId: string): void {
  try {
    localStorage.setItem(KEY_PREFIX + sessionId, lastMessageId);
  } catch {
    // Private browsing / storage disabled — the badge just won't clear on
    // this browser, which is no worse than the bug this file fixes.
  }
}

export function isSessionUnread(
  sessionId: string,
  lastMessageId: string | null | undefined
): boolean {
  if (!lastMessageId) return false;
  return getSeenMessageId(sessionId) !== lastMessageId;
}

"use client"

import { useEffect, useRef } from "react"
import { useSession } from "next-auth/react"

import { getMyProfile } from "@/lib/api/users"

/**
 * USR-001 — puts the profile picture into a session that was signed in before
 * the session carried one.
 *
 * The picture reaches the header through the session token, which is set at
 * sign-in and again whenever the profile is saved. Neither of those has
 * happened for anyone already signed in when this shipped, and nothing else
 * would ever put one there — so the header would show an initial until the
 * person happened to sign out and back in, which is not something anyone would
 * think to do. "It only works for new accounts" is how a feature quietly looks
 * broken.
 *
 * The access token renewal in auth.ts backfills this too, but on its own
 * schedule: up to fifteen minutes of showing the wrong thing. This closes that
 * window on the next page load.
 *
 * It reconciles rather than fills a blank. The first version only acted when
 * the session had no picture at all, which left the worse case untouched: a
 * session holding an *old* picture never corrected itself, because something
 * was there and that was taken for it being right. Changing your picture in
 * one tab and looking at another showed the previous one indefinitely.
 *
 * One request per tab, whatever the answer, and then never again:
 *
 *   - signed out → no request at all
 *   - session and account agree → one request, nothing written
 *   - they differ → one request, and the session is corrected
 *
 * The flag lives in sessionStorage rather than a ref because this component
 * never unmounts but the page does reload, and a ref does not survive that.
 */

/**
 * Set once this tab has reconciled the session against the account. Never set
 * on failure: a flag written before the answer is known turns one bad moment
 * into a tab that can never heal, however many times it reloads.
 *
 * The suffix retires flags written by earlier versions, which recorded a
 * narrower question and would otherwise silence this one — nobody should have
 * to be told to clear their web storage for a fix to reach them.
 */
const CHECKED_KEY = "bidnest_avatar_synced_3"

function alreadyChecked(): boolean {
  try {
    return sessionStorage.getItem(CHECKED_KEY) === "1"
  } catch {
    // Web storage throws in some privacy modes. Falling back to "checked"
    // rather than "not checked" — one missing picture beats a request on
    // every page load forever.
    return true
  }
}

function markChecked() {
  try {
    sessionStorage.setItem(CHECKED_KEY, "1")
  } catch {
    // The in-memory guard below still covers this page load.
  }
}

export function SessionAvatarSync() {
  const { data: session, status, update } = useSession()
  const running = useRef(false)

  /**
   * What the session holds right now, readable from inside the request below.
   *
   * That request is in flight for a moment, and saving a new picture during it
   * finishes first — so without this, the profile fetched a moment ago (still
   * carrying the old picture) would land afterwards and put it back. Which is
   * the version of this bug that only happens sometimes.
   */
  useEffect(() => {
    if (status !== "authenticated") return
    if (running.current || alreadyChecked()) return

    running.current = true

    void (async () => {
      try {
        const profile = await getMyProfile()
        const onAccount = profile.profile.avatarUrl ?? null

        // The account is the source of truth, so this writes what it says.
        // A save landing at the same moment writes the same value from the
        // same place, which is why the two cannot disagree for long — and
        // why guarding the write against a concurrent one is not worth the
        // ways that guard can misfire.
        //
        // Only when they differ, though: writing an identical value would
        // rewrite the session cookie on every page load for no reason.
        if (onAccount !== (session?.user?.image ?? null)) {
          await update({ image: onAccount })
        }

        // Reconciled either way — that is what the flag records.
        markChecked()
      } catch {
        // Deliberately not marked. The first attempt can land while the API is
        // still starting, and marking here would retire this tab's only chance
        // to heal on the strength of one bad moment — the reload that would
        // have fixed it does nothing, forever. A picture is not worth an error
        // message, but it is worth trying again.
        running.current = false
      }
    })()
  }, [status, session?.user?.image, update])

  return null
}

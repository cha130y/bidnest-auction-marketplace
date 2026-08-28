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
 * Runs at most once per tab, and only for a session that has no picture:
 *
 *   - signed out, or the picture is already there → no request at all
 *   - no picture on the account either → one request, then never again, so an
 *     account that has not chosen a picture does not pay for this on every
 *     page
 *
 * The flag lives in sessionStorage rather than a ref because this component
 * never unmounts but the page does reload, and a ref does not survive that.
 */

/**
 * Set once this tab has a *conclusive* answer — the account has no picture.
 * Never set on failure: a flag written before the answer is known turns one
 * bad moment into a tab that can never heal, however many times it reloads.
 */
// The `2` retires the flags written by the first version of this, which set
// them before the answer was known: a tab that failed once was left unable to
// heal for as long as it stayed open, and telling everyone to clear their web
// storage is not a fix anyone should have to be told.
const CHECKED_KEY = "bidnest_avatar_synced_2"

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

  useEffect(() => {
    if (status !== "authenticated") return
    // Already has one, or is on its way to having one.
    if (session?.user?.image || running.current || alreadyChecked()) return

    running.current = true

    void (async () => {
      try {
        const profile = await getMyProfile()

        if (profile.profile.avatarUrl) {
          await update({ image: profile.profile.avatarUrl })
          // Nothing to remember: the session now has a picture, so the guard
          // at the top is what stops this running again.
          return
        }

        // A conclusive "there is no picture on this account" — the one case
        // worth remembering, since asking again on every page load would cost
        // a request forever for anyone who has not chosen one.
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

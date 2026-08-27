"use client"

import { useSyncExternalStore } from "react"

/** Nothing to subscribe to: the answer changes exactly once, at hydration. */
const subscribe = () => () => {}

/**
 * False during the render that hydrates the server's HTML, true from then on.
 *
 * Anything only the browser can answer — a session, localStorage, the clock —
 * has to stay behind this for one render, so that render agrees with the HTML
 * the server sent and the real answer arrives afterwards as an ordinary
 * update. `useCountdown`'s `isReady` is the same idea for the same reason.
 *
 * The subtlety it exists for: "the first client render happens before the
 * session resolves" is not true everywhere. Content inside a `<Suspense>`
 * boundary hydrates *after* the shell, so by the time a card halfway down the
 * home page hydrates, `SessionProvider`'s fetch has already landed — and that
 * render would claim a signed-in state against HTML the server rendered
 * signed-out. React reports it as an attribute mismatch it will not patch up.
 *
 * `useSyncExternalStore` rather than a `useState` + `useEffect` flag because
 * its third argument is precisely "the value to use while hydrating": React
 * reads the server snapshot for the hydration render and switches to the
 * client one after commit, without a self-triggering effect.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  )
}

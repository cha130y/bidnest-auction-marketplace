import { Suspense } from "react"

import { LoginForm } from "@/app/login/login-form"
import { OAuthButtons } from "@/components/auth/oauth-buttons"

export const metadata = { title: "เข้าสู่ระบบ · BidNest" }

/**
 * Read at request time, not at build time. This page would otherwise be
 * prerendered, baking in whatever LINE_CHANNEL_ID happened to be set when the
 * image was built — and a deployment that supplies it at runtime would ship a
 * login page with the Line button silently missing.
 */
export const dynamic = "force-dynamic"

/**
 * AUTH-002 — the form reads `callbackUrl` with `useSearchParams()`, which Next
 * requires a Suspense boundary around so the rest of the page can still be
 * prerendered. The form brings its own shell (AuthCard).
 *
 * Whether Line is offered is decided here, on the server: LINE_CHANNEL_SECRET
 * makes the flow a server-side one, so the browser has no way to know, and a
 * button that only ever answers 503 is worse than no button.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm
        oauth={
          <OAuthButtons
            lineEnabled={Boolean(
              // Both, because the round trip needs both: the id to send the
              // user to Line, the secret to redeem what comes back. Offering
              // the button on the id alone would only fail at the callback,
              // after the user had already approved.
              process.env.LINE_CHANNEL_ID && process.env.LINE_CHANNEL_SECRET
            )}
          />
        }
      />
    </Suspense>
  )
}

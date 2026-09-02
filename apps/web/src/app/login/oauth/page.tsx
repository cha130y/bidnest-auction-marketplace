import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { OAuthReady } from "@/app/login/oauth/oauth-ready"
import { OAuthVerifyForm } from "@/app/login/oauth/oauth-verify-form"
import { hasParkedTokens, readPending } from "@/lib/auth/oauth-flow"

export const metadata = { title: "ยืนยันตัวตน · BidNest" }

/**
 * AUTH-007 for a provider sign-in.
 *
 * A page of its own rather than another branch of the login form, because Line
 * gets here by a full-page redirect and needs somewhere to land. Which step to
 * show comes from the query string, which is safe to trust: a forged
 * `?need=email` only shows the address form, and submitting it re-runs step
 * one, which answers PENDING_2FA and puts the user back on the code. A forged
 * `?ready=1` shows a screen that immediately fails to claim a cookie nobody
 * parked.
 *
 * Neither the provider token nor an issued pair is ever in the URL — both live
 * in httpOnly cookies this reads, and their absence means the flow expired or
 * never began.
 */
export default async function OAuthVerifyPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams

  // AUTH-007 — the device was already trusted, so apps/api issued the tokens
  // at the callback and there is no code to ask for.
  if (params.ready === "1" && (await hasParkedTokens())) {
    return (
      <main className="mx-auto w-full max-w-sm px-4 py-16">
        <OAuthReady label="LINE" />
      </main>
    )
  }

  const pending = await readPending()
  if (!pending) {
    // The second place that answers with "เซสชันหมดอายุ กรุณาลองใหม่", and from
    // the login page the two are indistinguishable. Reaching here means the
    // callback did its work and set the cookie, and the browser that landed
    // here did not send it back — a different failure from Line never
    // returning the state at all, and one worth being able to tell apart.
    console.warn(
      `[login/oauth] no pending sign-in: ready=${params.ready === "1"} ` +
        `cookiesOnRequest=${(await cookies()).getAll().length}`
    )
    redirect(`/login?error=${encodeURIComponent("เซสชันหมดอายุ กรุณาลองใหม่")}`)
  }

  return (
    <main className="mx-auto w-full max-w-sm px-4 py-16">
      <OAuthVerifyForm
        provider={pending.provider}
        needsEmail={params.need === "email"}
        callbackUrl={pending.callbackUrl ?? "/"}
      />
    </main>
  )
}

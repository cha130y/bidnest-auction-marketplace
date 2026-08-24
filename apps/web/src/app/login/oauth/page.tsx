import { redirect } from "next/navigation"

import { OAuthVerifyForm } from "@/app/login/oauth/oauth-verify-form"
import { readPending } from "@/lib/auth/oauth-flow"

export const metadata = { title: "ยืนยันตัวตน · BidNest" }

/**
 * AUTH-007 for a provider sign-in.
 *
 * A page of its own rather than another branch of the login form, because Line
 * gets here by a full-page redirect and needs somewhere to land. Which step to
 * show comes from the query string, which is safe to trust: a forged
 * `?need=email` only shows the address form, and submitting it re-runs step
 * one, which answers PENDING_2FA and puts the user back on the code.
 *
 * The provider token itself is never in the URL — it is in the httpOnly cookie
 * this reads, and its absence means the flow expired or never began.
 */
export default async function OAuthVerifyPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const pending = await readPending()
  if (!pending) {
    redirect(`/login?error=${encodeURIComponent("เซสชันหมดอายุ กรุณาลองใหม่")}`)
  }

  const params = await searchParams

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

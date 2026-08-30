"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Script from "next/script"
import { signIn } from "next-auth/react"

import { Separator } from "@/components/ui/separator"

/**
 * AUTH-003 / AUTH-006 — the two provider buttons under the password form.
 *
 * They take different roads to the same place. Google Identity Services hands
 * an ID token to the page directly, so no client secret is involved anywhere
 * and the browser can post it in one call. Line issues only an authorization
 * code, and redeeming it needs the channel secret, so that one leaves through
 * /api/auth/line/start and comes back through the callback.
 *
 * Both end at /login/oauth, where AUTH-007's emailed code is collected — the
 * reason neither uses NextAuth's own Google or Line provider, which cannot
 * pause a redirect midway to ask for one.
 */

/** Only the sliver of Google Identity Services this file touches. */
type GoogleIdentity = {
  accounts: {
    id: {
      initialize(config: {
        client_id: string
        callback: (response: { credential?: string }) => void
        auto_select?: boolean
        cancel_on_tap_outside?: boolean
      }): void
      renderButton(
        parent: HTMLElement,
        options: {
          theme?: "outline" | "filled_blue"
          size?: "large" | "medium"
          width?: number
          text?: "signin_with" | "continue_with"
          locale?: string
        }
      ): void
    }
  }
}

declare global {
  interface Window {
    google?: GoogleIdentity
  }
}

/**
 * Why a provider is missing — said to whoever is setting the app up, and to
 * nobody else.
 *
 * The name of an unset variable is a note to a developer: it means nothing to
 * a visitor, and on a deployment where one provider is configured and the
 * other is not, it would print our own configuration on the public login page.
 * `NODE_ENV` is inlined at build time, so this leaves the production bundle
 * entirely rather than being hidden after the fact.
 *
 * Nothing is lost by the silence. `pnpm check:setup` reports the same thing
 * with more detail and without a browser, and a visitor learns exactly as much
 * from a button that is not there.
 */
function NotConfigured({ hint }: { hint: string }) {
  if (process.env.NODE_ENV === "production") return null

  return (
    <p className="text-center text-xs text-muted-foreground">
      ยังไม่ได้ตั้งค่า {hint}
    </p>
  )
}

export function OAuthButtons({ lineEnabled }: { lineEnabled: boolean }) {
  const router = useRouter()
  const params = useSearchParams()
  const callbackUrl = params.get("callbackUrl") ?? undefined

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  const googleSlot = useRef<HTMLDivElement>(null)
  const [scriptReady, setScriptReady] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const signInWithGoogle = useCallback(
    async (credential: string) => {
      setFailure(null)
      const response = await fetch("/api/auth/oauth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "google",
          idToken: credential,
          callbackUrl
        })
      })
      const body: unknown = await response.json().catch(() => ({}))

      if (!response.ok) {
        const message = (body as { message?: string }).message
        setFailure(message ?? "เข้าสู่ระบบด้วย Google ไม่สำเร็จ")
        return
      }

      // AUTH-007 — a browser this account has answered a code from before
      // gets the tokens here and never sees the code screen.
      if (body && typeof body === "object" && "accessToken" in body) {
        const signedIn = await signIn("oauth-tokens", {
          payload: JSON.stringify(body),
          redirect: false
        })
        if (signedIn?.error) {
          setFailure("เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่")
          return
        }
        router.push(callbackUrl ?? "/")
        router.refresh()
        return
      }

      // A Google account always carries a verified address, so EMAIL_REQUIRED
      // cannot happen on this path — straight to the code.
      router.push("/login/oauth")
    },
    [callbackUrl, router]
  )

  useEffect(() => {
    if (!scriptReady || !clientId || !googleSlot.current) return
    const identity = window.google
    if (!identity) return

    identity.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => {
        if (response.credential) void signInWithGoogle(response.credential)
      },
      // One Tap is off: a sign-in that starts on its own would skip the
      // callbackUrl the user arrived with.
      auto_select: false,
      cancel_on_tap_outside: true
    })
    identity.accounts.id.renderButton(googleSlot.current, {
      theme: "outline",
      size: "large",
      width: 320,
      text: "signin_with",
      locale: "th"
    })
  }, [scriptReady, clientId, signInWithGoogle])

  if (!clientId && !lineEnabled) return null

  const lineHref = callbackUrl
    ? `/api/auth/line/start?callbackUrl=${encodeURIComponent(callbackUrl)}`
    : "/api/auth/line/start"

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs text-muted-foreground">หรือ</span>
        <Separator className="flex-1" />
      </div>

      {clientId ? (
        <>
          <Script
            src="https://accounts.google.com/gsi/client"
            strategy="afterInteractive"
            onReady={() => setScriptReady(true)}
          />
          <div ref={googleSlot} className="flex justify-center" />
        </>
      ) : (
        <NotConfigured hint="NEXT_PUBLIC_GOOGLE_CLIENT_ID" />
      )}

      {lineEnabled ? (
        <a
          href={lineHref}
          className="flex h-10 w-full items-center justify-center rounded-md bg-[#06C755] text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          เข้าสู่ระบบด้วย LINE
        </a>
      ) : (
        <NotConfigured hint="LINE Login (LINE_CHANNEL_ID / LINE_CHANNEL_SECRET)" />
      )}

      {failure && (
        <p className="text-center text-sm text-destructive">{failure}</p>
      )}
    </div>
  )
}

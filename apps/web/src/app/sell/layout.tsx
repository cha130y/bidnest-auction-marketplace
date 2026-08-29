import { SiteFooter } from "@/components/layout/site-footer"
import { AppHeader } from "@/components/layout/app-header"

/**
 * Chrome for the seller screens.
 *
 * A layout here rather than repeating the header in four pages — and scoped to
 * `/sell` rather than added to `app/layout.tsx`, which Dev 3 deliberately left
 * free of module-specific markup so admin and auth render without it.
 */
export default function SellLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-n-100">
      <AppHeader />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-250 px-4 pb-16 md:px-6">
          {children}
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}

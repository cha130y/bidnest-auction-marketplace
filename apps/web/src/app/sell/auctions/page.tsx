import type { Metadata } from "next"
import Link from "next/link"

import { OwnedDraftsList } from "@/components/auction/owned-drafts-screen"
import { SellerShell } from "@/components/auction/seller-shell"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "ร่างของฉัน · BidNest",
  description: "ร่างการประมูลที่ยังไม่ได้เผยแพร่",
}

/** AUC-001 — the seller's own unpublished drafts. */
export default function OwnedAuctionsPage() {
  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4 py-8">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
            ร่างของฉัน
          </h1>
          <p className="mt-2 text-base text-n-600">
            รายการที่ยังไม่ได้เผยแพร่ — มีแต่คุณที่เห็น
          </p>
        </div>
        <Button variant="primary" size="lg" nativeButton={false} render={<Link href="/sell" />}>
          สร้างรายการใหม่
        </Button>
      </header>

      <SellerShell>
        <OwnedDraftsList />
      </SellerShell>
    </>
  )
}

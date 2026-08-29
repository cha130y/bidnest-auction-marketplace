import type { Metadata } from "next"
import Link from "next/link"

import { OwnedAuctionsList } from "@/components/auction/owned-auctions-screen"
import { SellerShell } from "@/components/auction/seller-shell"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "การประมูลของฉัน · BidNest",
  description: "ร่าง รายการที่ตั้งเวลาไว้ และผลการประมูลของคุณ",
}

/**
 * AUC-006 — the seller's own auctions, in every state.
 *
 * Was a list of unpublished drafts and nothing else, which left a published
 * auction with nowhere to be found and a scheduled one with no way to be
 * called off. It is now the counterpart of `/sell/products`: the list is the
 * page you land on, and `/sell` is the form that starts a new one — the same
 * shape as `/sell/products` and `/sell/products/new`.
 */
export default function OwnedAuctionsPage() {
  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4 py-8">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
            การประมูลของฉัน
          </h1>
          <p className="mt-2 text-base text-n-600">
            ทำร่างที่ค้างไว้ต่อ และดูรายการที่เผยแพร่แล้ว
          </p>
        </div>

        {/* No link to /sell/settings from here, on purpose: the only setting
            it holds is the after-sale auto-reply, which is sent for product
            orders and skipped for an auction win (checkout.service.ts). A way
            in from an auction screen reads as though it applied to auctions
            too. It is reachable from /sell/products, where it does apply. */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            size="lg"
            nativeButton={false}
            render={<Link href="/sell" />}
          >
            สร้างการประมูลใหม่
          </Button>
        </div>
      </header>

      <SellerShell>
        <OwnedAuctionsList />
      </SellerShell>
    </>
  )
}

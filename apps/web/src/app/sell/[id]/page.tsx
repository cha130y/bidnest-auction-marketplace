import type { Metadata } from "next"
import Link from "next/link"

import { DraftDetail } from "@/components/auction/draft-detail-screen"
import { SellerShell } from "@/components/auction/seller-shell"

export const metadata: Metadata = {
  title: "ร่างการประมูล · BidNest",
  description: "ตรวจสอบและเผยแพร่ร่างการประมูล",
}

/** AUC-002 / AUC-004 / AUC-006 — check it, publish it, or withdraw it. */
export default async function DraftPage({ params }: PageProps<"/sell/[id]">) {
  const { id } = await params

  return (
    <>
      <nav className="py-6 text-sm text-n-500">
        <Link href="/sell/auctions" className="hover:text-ink">
          ร่างของฉัน
        </Link>
        <span className="px-2">/</span>
        <span className="text-n-600">ตรวจสอบก่อนเผยแพร่</span>
      </nav>

      <SellerShell>
        <DraftDetail auctionId={id} />
      </SellerShell>
    </>
  )
}

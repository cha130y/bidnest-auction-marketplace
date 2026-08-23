import type { Metadata } from "next"
import Link from "next/link"

import { EditDraftScreen } from "@/components/auction/edit-draft-screen"
import { SellerShell } from "@/components/auction/seller-shell"

export const metadata: Metadata = {
  title: "แก้ไขร่าง · BidNest",
  description: "แก้ไขรายละเอียดร่างการประมูล",
}

/** AUC-006 — edit. What may still change is the API's call, not this page's. */
export default async function EditDraftPage({
  params,
}: PageProps<"/sell/[id]/edit">) {
  const { id } = await params

  return (
    <>
      <nav className="py-6 text-sm text-n-500">
        <Link href={`/sell/${id}`} className="hover:text-ink">
          ร่างการประมูล
        </Link>
        <span className="px-2">/</span>
        <span className="text-n-600">แก้ไข</span>
      </nav>

      <SellerShell>
        <EditDraftScreen auctionId={id} />
      </SellerShell>
    </>
  )
}

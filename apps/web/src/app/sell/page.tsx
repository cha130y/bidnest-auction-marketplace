import type { Metadata } from "next"
import Link from "next/link"

import { CreateDraftScreen } from "@/components/auction/create-draft-screen"

export const metadata: Metadata = {
  title: "ลงประมูล · BidNest",
  description: "สร้างรายการประมูลใหม่บน BidNest",
}

/** AUC-001 — start a draft. */
export default function SellPage() {
  return (
    <>
      <header className="py-8">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
          ลงประมูล
        </h1>
        <p className="mt-2 text-base text-n-600">
          บันทึกเป็นร่างไว้ก่อนได้ ยังไม่ต้องกรอกครบ —
          หน้าถัดไปจะบอกว่าเหลืออะไรก่อนเผยแพร่
        </p>
        <Link
          href="/sell/auctions"
          className="mt-2 inline-block text-sm font-semibold text-amber-600 hover:text-ink"
        >
          การประมูลของฉัน
        </Link>
        <Link
          href="/sell/settings"
          className="mt-2 ml-4 inline-block text-sm font-semibold text-amber-600 hover:text-ink"
        >
          ตั้งค่าร้านค้า
        </Link>
      </header>

      <CreateDraftScreen />
    </>
  )
}

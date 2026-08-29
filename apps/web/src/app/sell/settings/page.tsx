import type { Metadata } from "next"

import { AutoReplySettings } from "@/components/chat/auto-reply-settings"
import { SellerShell } from "@/components/auction/seller-shell"

export const metadata: Metadata = {
  title: "ตั้งค่าร้านค้า · BidNest",
  description: "ตั้งค่าข้อความอัตโนมัติหลังการขาย",
}

/** CHAT-004 — the seller's own settings, starting with the one there is. */
export default function SellerSettingsPage() {
  return (
    <>
      <header className="py-8">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
          ตั้งค่าร้านค้า
        </h1>
      </header>

      <SellerShell>
        <AutoReplySettings />
      </SellerShell>
    </>
  )
}

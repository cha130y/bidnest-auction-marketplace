"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { PauseCircle, PlayCircle, ShieldAlert, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api/client"
import { deleteProduct, updateProductStatus } from "@/lib/api/products"
import type { OwnerProduct } from "@/lib/api/types"

/**
 * PROD-002 — the two things the details form deliberately cannot do: take a
 * listing off sale, and delete it.
 *
 * They live apart from that form for the reason the API keeps
 * `PATCH /products/:id/status` apart from `PATCH /products/:id` — "a routine
 * edit can never flip a listing off sale by accident". Fixing a typo and
 * pulling a listing are different intents, so they get different buttons.
 *
 * Pausing is the loud one and deleting is the quiet one, because REMOVED is
 * terminal in V1 and INACTIVE is what a seller almost always means. A seller
 * who deletes to "hide it for a while" does not get the listing back.
 */
export function ProductManagePanel({
  product,
  onChanged,
}: {
  product: OwnerProduct
  onChanged: (product: OwnerProduct) => void
}) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Set when a delete came back as a deactivation instead. */
  const [deactivated, setDeactivated] = useState<string | null>(null)

  // ADM-005 — an admin takedown is the one state where nothing on this panel
  // would work. The API rejects every write while a listing is SUSPENDED, so
  // showing the buttons would only produce a 403 the seller cannot act on.
  if (product.status === "SUSPENDED") {
    return (
      <section className="rounded-r4 border border-red bg-red-50 p-6">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-red">
          <ShieldAlert className="size-5" aria-hidden="true" />
          สินค้านี้ถูกระงับโดยแอดมิน
        </h2>
        <p className="mt-2 text-sm text-n-600">
          ระหว่างที่ถูกระงับ จะแก้ไขข้อมูล เปลี่ยนสถานะ หรือลบไม่ได้
          มีเพียงแอดมินเท่านั้นที่เปิดการขายกลับให้ได้
          หากคิดว่าเป็นความเข้าใจผิด กรุณาติดต่อทีมงาน
        </p>
      </section>
    )
  }

  if (product.status === "REMOVED") {
    return (
      <section className="rounded-r4 bg-white p-6 shadow-sh1">
        <h2 className="font-display text-lg font-bold text-ink">
          สินค้านี้ถูกลบแล้ว
        </h2>
        <p className="mt-2 text-sm text-n-600">
          เก็บไว้เพื่อให้ประวัติคำสั่งซื้อยังอ้างอิงได้ แต่กู้คืนไม่ได้
        </p>
      </section>
    )
  }

  const isPaused = product.status === "INACTIVE"

  const run = async (action: () => Promise<void>) => {
    setError(null)
    setBusy(true)
    try {
      await action()
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "ดำเนินการไม่สำเร็จ"
      )
    } finally {
      setBusy(false)
    }
  }

  const toggleStatus = () =>
    run(async () => {
      setDeactivated(null)
      // Asking for ACTIVE with no stock left answers OUT_OF_STOCK (PROD-005),
      // so the panel redraws from what came back rather than from what it asked
      // for.
      onChanged(
        await updateProductStatus(product.id, isPaused ? "ACTIVE" : "INACTIVE")
      )
    })

  const remove = () =>
    run(async () => {
      const result = await deleteProduct(product.id)

      if (result.status === "REMOVED") {
        // The listing is gone from `/sell/products`, and this screen is now
        // editing something that cannot be edited. Leave rather than sit on it.
        router.push("/sell/products")
        return
      }

      // Orders still point at it, so the API deactivated it instead. Say so —
      // the seller pressed delete and the listing is still on their shelf.
      setConfirming(false)
      setDeactivated(result.message)
      onChanged({ ...product, status: "INACTIVE" })
    })

  return (
    <section className="space-y-5 rounded-r4 bg-white p-6 shadow-sh1">
      <div>
        <h2 className="font-display text-lg font-bold text-ink">
          สถานะการขาย
        </h2>
        <p className="mt-1 text-sm text-n-600">
          {isPaused
            ? "ตอนนี้หยุดขายชั่วคราว ผู้ซื้อค้นหาไม่เจอและเพิ่มลงตะกร้าไม่ได้ เปิดกลับเมื่อไหร่ก็ได้"
            : "ตอนนี้อยู่ในแคตตาล็อก หยุดขายชั่วคราวได้ทุกเมื่อ แล้วค่อยเปิดกลับ ข้อมูลและรูปยังอยู่ครบ"}
        </p>
      </div>

      <Button
        variant={isPaused ? "primary" : "secondary"}
        size="lg"
        onClick={() => void toggleStatus()}
        disabled={busy}
      >
        {isPaused ? (
          <PlayCircle aria-hidden="true" />
        ) : (
          <PauseCircle aria-hidden="true" />
        )}
        {isPaused ? "เปิดขายอีกครั้ง" : "หยุดขายชั่วคราว"}
      </Button>

      {deactivated && (
        <p
          role="status"
          className="rounded-r3 bg-amber-50 px-4 py-3 text-sm text-ink"
        >
          ลบถาวรไม่ได้เพราะมีคำสั่งซื้ออ้างอิงสินค้านี้อยู่
          ระบบจึงหยุดขายให้แทนเพื่อรักษาประวัติคำสั่งซื้อ — ผู้ซื้อจะไม่เห็นสินค้านี้แล้ว
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-rose-600">
          {error}
        </p>
      )}

      <div className="border-t border-n-200 pt-5">
        {confirming ? (
          <div className="rounded-r3 border border-red bg-red-50 p-4">
            <p className="font-semibold text-red">ยืนยันลบสินค้านี้?</p>
            <p className="mt-2 text-sm text-n-600">
              การลบ<strong className="text-ink">กู้คืนไม่ได้</strong>{" "}
              และไม่มีฟีเจอร์กู้คืนในเวอร์ชันนี้ ถ้าเพียงต้องการพักขายชั่วคราว
              ให้ใช้ &ldquo;หยุดขายชั่วคราว&rdquo; แทน
              ซึ่งเปิดกลับเองได้ตลอดและข้อมูลยังอยู่ครบ
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                variant="danger"
                size="sm"
                onClick={() => void remove()}
                disabled={busy}
              >
                {busy ? "กำลังลบ…" : "ยืนยันลบถาวร"}
              </Button>

              {/* The alternative the team asked to be offered here, one press
                  away instead of a sentence telling them to go find it. */}
              {!isPaused && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setConfirming(false)
                    void toggleStatus()
                  }}
                  disabled={busy}
                >
                  หยุดขายชั่วคราวแทน
                </Button>
              )}

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirming(false)}
                disabled={busy}
              >
                ไม่ลบแล้ว
              </Button>
            </div>
          </div>
        ) : (
          <>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setConfirming(true)}
              disabled={busy}
            >
              <Trash2 aria-hidden="true" />
              ลบสินค้า
            </Button>
            <p className="mt-2 text-xs text-n-500">
              ลบแล้วกู้คืนไม่ได้ · สินค้าที่มีคำสั่งซื้ออ้างอิงอยู่จะถูกหยุดขายแทน
            </p>
          </>
        )}
      </div>
    </section>
  )
}
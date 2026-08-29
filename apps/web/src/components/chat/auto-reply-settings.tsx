"use client"

import { useEffect, useState } from "react"
import { useMutation } from "@tanstack/react-query"

import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api/client"
import {
  fetchAutoReplyMessage,
  updateAutoReplyMessage,
} from "@/lib/api/chat"

const MAX_LENGTH = 500

/**
 * CHAT-004 — the seller's own "thanks for your order" line, sent once
 * automatically the moment a buyer's order for one of their listings is
 * placed (see checkout.service.ts). Empty means off — most sellers start
 * here, and clearing the field is how they turn it back off.
 */
export function AutoReplySettings() {
  const [message, setMessage] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [error, setError] = useState<unknown>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetchAutoReplyMessage()
      .then((result) => {
        setMessage(result.message)
        setDraft(result.message ?? "")
      })
      .catch((caught: unknown) => setError(caught))
  }, [])

  const mutation = useMutation({
    mutationFn: (value: string) => updateAutoReplyMessage(value || null),
    onSuccess: (result) => {
      setMessage(result.message)
      setDraft(result.message ?? "")
      setSaved(true)
    },
  })

  if (error) {
    return (
      <div className="rounded-r4 border border-red bg-red-50 px-6 py-8 text-center">
        <p className="font-semibold text-red">
          {error instanceof ApiError
            ? error.message
            : "โหลดการตั้งค่าไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"}
        </p>
      </div>
    )
  }

  const dirty = draft.trim() !== (message ?? "")

  return (
    <div className="rounded-r4 bg-white p-6 shadow-sh1">
      <h2 className="font-display text-lg font-bold text-ink">
        ข้อความอัตโนมัติหลังการขาย
      </h2>
      <p className="mt-1 text-sm text-n-500">
        เมื่อมีคนซื้อสินค้าของร้านคุณสำเร็จ ระบบจะส่งข้อความนี้เข้าห้องแชทกับผู้ซื้อให้อัตโนมัติ
        เว้นว่างไว้เพื่อปิดการทำงานนี้
      </p>

      <textarea
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value)
          setSaved(false)
        }}
        maxLength={MAX_LENGTH}
        rows={4}
        placeholder="เช่น ขอบคุณที่อุดหนุนร้านเรานะครับ หากมีปัญหาเรื่องสินค้าทักมาได้เลยครับ"
        className="mt-4 w-full rounded-r3 border border-n-300 bg-white px-4 py-3 text-sm text-ink outline-none focus:border-amber-500 focus:shadow-focus"
      />

      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-n-400">
          {draft.length}/{MAX_LENGTH}
        </span>
        {mutation.isError && (
          <span className="text-xs text-red">
            {mutation.error instanceof ApiError
              ? mutation.error.message
              : "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"}
          </span>
        )}
        {saved && !dirty && (
          <span className="text-xs font-medium text-green">บันทึกแล้ว</span>
        )}
      </div>

      <Button
        variant="primary"
        size="md"
        className="mt-3"
        disabled={!dirty || mutation.isPending}
        onClick={() => mutation.mutate(draft.trim())}
      >
        {mutation.isPending ? "กำลังบันทึก…" : "บันทึก"}
      </Button>
    </div>
  )
}

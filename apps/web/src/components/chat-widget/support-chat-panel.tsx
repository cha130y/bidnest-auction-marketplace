'use client';

import { KeyboardEvent, useState } from 'react';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { Send } from 'lucide-react';

import MessageList from '@/components/chat-widget/message-list';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api/client';
import { useAuthToken } from '@/lib/api/auth/use-auth-token';
import { loginHref } from '@/lib/api/auth/login-redirect';
import {
  ChatMessage,
  SupportSessionStatus,
  escalateSupportSession,
  sendSupportChatMessage,
  sendSupportSessionMessage,
} from '@/lib/api/support-chat';

/**
 * A first-time visitor facing an empty box has no cue what BidNest can even
 * answer — these are here to give them a start, not to be exhaustive.
 * Hardcoded rather than admin-editable: this is a fixed, short FAQ starter
 * list, not content that changes often enough to need its own screen.
 */
const SUGGESTED_QUESTIONS = [
  'สมัครสมาชิกยังไง',
  'วิธีเสนอราคาประมูล',
  'ชำระเงินได้ช่องทางไหนบ้าง',
  'ติดตามสถานะจัดส่งได้ที่ไหน',
  'เพิ่มลงตะกร้ากับซื้อเลยต่างกันยังไง',
  'ต่อรองราคากับ AI ได้ไหม',
  'ตะกร้า รายการที่ติดตาม แจ้งเตือนอยู่ตรงไหน',
  'ยกเลิกคำสั่งซื้อได้ไหม',
];

interface SupportChatPanelProps {
  sessionId: string | undefined;
  setSessionId: (value: string | undefined) => void;
  sessionStatus: SupportSessionStatus;
  setSessionStatus: (value: SupportSessionStatus) => void;
  messages: ChatMessage[];
  setMessages: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
}

/**
 * AI-001 — the assistant tab's content. Works the same whether the viewer is
 * signed in or not: `sendSupportChatMessage` always sends this widget's own
 * in-memory `messages` as `history`, and the backend only actually reads that
 * for a guest (a signed-in caller's history lives server-side against
 * `sessionId` instead — see support-chat.service.ts). One code path either
 * way, rather than branching on auth state here too.
 *
 * `sessionId`/`sessionStatus`/`messages` live in ChatWidget (the parent), not
 * here — closing the popover used to unmount this panel and lose the
 * conversation outright, and the realtime subscription needs to keep running
 * while closed anyway (that's what makes the unread dot possible).
 *
 * Once escalated (or resolved and reopened by an admin), the send button
 * switches to `sendSupportSessionMessage` (no more AI calls) — the admin's
 * replies then arrive over the parent's `useSupportSessionRoom`, not as this
 * mutation's response.
 */
export function SupportChatPanel({
  sessionId,
  setSessionId,
  sessionStatus,
  setSessionStatus,
  messages,
  setMessages,
}: SupportChatPanelProps) {
  const { token } = useAuthToken();
  const [input, setInput] = useState('');
  const [lastFailedText, setLastFailedText] = useState<string | null>(null);
  const [escalated, setEscalated] = useState(false);

  const appendOwnMessage = (text: string) => {
    setLastFailedText(null);
    setMessages((prev) => [
      ...prev,
      {
        id: `temp-${Date.now()}`,
        sessionId: sessionId ?? null,
        role: 'USER',
        body: text,
        createdAt: new Date().toISOString(),
      },
    ]);
  };

  const aiMutation = useMutation({
    mutationFn: (text: string) =>
      sendSupportChatMessage(text, sessionId, messages),
    onMutate: appendOwnMessage,
    onSuccess: (data) => {
      setSessionId(data.sessionId ?? undefined);
      setMessages((prev) => [...prev, data.reply]);
      setEscalated(data.escalated);
    },
    onError: (_error, text) => setLastFailedText(text),
  });

  const adminMutation = useMutation({
    mutationFn: (text: string) => sendSupportSessionMessage(sessionId!, text),
    onMutate: appendOwnMessage,
    onError: (_error, text) => setLastFailedText(text),
  });

  const escalateMutation = useMutation({
    mutationFn: () => escalateSupportSession(sessionId!),
    onSuccess: (session) => setSessionStatus(session.status),
  });

  // RESOLVED still goes to the admin endpoint, not the AI: sending here
  // reopens the session back to ESCALATED server-side (see
  // SupportChatService#sendUserMessageToAdmin), same conversation.
  const sending = sessionStatus !== 'AI_ONLY' ? adminMutation : aiMutation;

  const errorMessage =
    sending.error instanceof ApiError ? sending.error.message : 'ส่งข้อความไม่สำเร็จ';

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    sending.mutate(text);
  };

  const handleSuggested = (question: string) => {
    setInput('');
    aiMutation.mutate(question);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col">
      {messages.length === 0 && (
        <div className="flex flex-col gap-2 px-4 pt-3">
          <p className="text-xs text-n-500">ถามได้เลย ไม่ต้องเข้าสู่ระบบก็ใช้งานได้</p>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTED_QUESTIONS.map((question) => (
              <button
                key={question}
                type="button"
                onClick={() => handleSuggested(question)}
                disabled={aiMutation.isPending}
                className="rounded-full border border-n-300 bg-white px-3 py-1.5 text-xs text-n-700 transition-colors hover:border-amber-500 hover:text-amber-700 disabled:opacity-50"
              >
                {question}
              </button>
            ))}
          </div>
        </div>
      )}

      <MessageList messages={messages} isPending={sending.isPending} />

      {escalated && sessionStatus === 'AI_ONLY' && (
        <div className="flex flex-col gap-2 px-4 pb-2">
          <p className="text-sm text-amber-700">
            ดูเหมือนคำถามนี้ยากเกินไปสำหรับผู้ช่วย AI —
            แนะนำให้ติดต่อแอดมินโดยตรง
          </p>
          {token ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => escalateMutation.mutate()}
              disabled={escalateMutation.isPending}
            >
              {escalateMutation.isPending ? 'กำลังเชื่อมต่อ...' : 'คุยกับแอดมิน'}
            </Button>
          ) : (
            <div className="flex items-center gap-2 text-sm text-n-600">
              <span>ต้องเข้าสู่ระบบก่อนถึงจะคุยกับแอดมินได้</span>
              <Link href={loginHref()} className="font-semibold text-amber-700 underline">
                เข้าสู่ระบบ
              </Link>
            </div>
          )}
          {escalateMutation.isError && (
            <p className="text-xs text-red">เชื่อมต่อแอดมินไม่สำเร็จ กรุณาลองใหม่</p>
          )}
        </div>
      )}

      {sessionStatus !== 'AI_ONLY' && (
        <div className="px-4 pb-2 text-xs text-n-500">
          กำลังคุยกับแอดมิน — ข้อความจะถูกส่งตรงถึงทีมงาน
        </div>
      )}

      {sending.isError && lastFailedText && (
        <div className="px-4 pb-2 text-sm text-red">
          {errorMessage}{' '}
          <button
            type="button"
            className="underline"
            onClick={() => sending.mutate(lastFailedText)}
          >
            ลองใหม่
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-n-200 p-3">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="พิมพ์คำถาม..."
          className="h-10 flex-1 rounded-r3 border border-n-300 bg-white px-3 text-sm text-ink outline-none focus:border-amber-500 focus:shadow-focus"
        />
        <Button
          type="button"
          variant="primary"
          size="icon"
          aria-label="ส่งคำถาม"
          onClick={handleSend}
          disabled={sending.isPending || !input.trim()}
        >
          <Send />
        </Button>
      </div>
    </div>
  );
}

'use client';

import { KeyboardEvent, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Send } from 'lucide-react';

import MessageList from '@/components/chat-widget/message-list';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api/client';
import { ChatMessage, sendSupportChatMessage } from '@/lib/api/support-chat';

/**
 * AI-001 — the assistant tab's content. Works the same whether the viewer is
 * signed in or not: `sendSupportChatMessage` always sends this widget's own
 * in-memory `messages` as `history`, and the backend only actually reads that
 * for a guest (a signed-in caller's history lives server-side against
 * `sessionId` instead — see support-chat.service.ts). One code path either
 * way, rather than branching on auth state here too.
 */
export function SupportChatPanel() {
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [lastFailedText, setLastFailedText] = useState<string | null>(null);
  const [escalated, setEscalated] = useState(false);

  const mutation = useMutation({
    mutationFn: (text: string) =>
      sendSupportChatMessage(text, sessionId, messages),
    onMutate: (text: string) => {
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
    },
    onSuccess: (data) => {
      setSessionId(data.sessionId ?? undefined);
      setMessages((prev) => [...prev, data.reply]);
      setEscalated(data.escalated);
    },
    onError: (_error, text) => {
      setLastFailedText(text);
    },
  });

  const errorMessage =
    mutation.error instanceof ApiError
      ? mutation.error.message
      : 'ส่งข้อความไม่สำเร็จ';

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    mutation.mutate(text);
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
        <p className="px-4 pt-3 text-xs text-n-500">
          ถามได้เลย ไม่ต้องเข้าสู่ระบบก็ใช้งานได้
        </p>
      )}

      <MessageList messages={messages} isPending={mutation.isPending} />

      {escalated && (
        <div className="px-4 pb-2 text-sm text-amber-700">
          ดูเหมือนคำถามนี้ยากเกินไปสำหรับผู้ช่วย AI —
          แนะนำให้ติดต่อแอดมินโดยตรง
        </div>
      )}

      {mutation.isError && lastFailedText && (
        <div className="px-4 pb-2 text-sm text-red">
          {errorMessage}{' '}
          <button
            type="button"
            className="underline"
            onClick={() => mutation.mutate(lastFailedText)}
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
          disabled={mutation.isPending || !input.trim()}
        >
          <Send />
        </Button>
      </div>
    </div>
  );
}

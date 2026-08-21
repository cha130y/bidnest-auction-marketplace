'use client';

import MessageList from '@/components/chat-widget/message-list';
import {
  ChatMessage,
  sendSupportChatMessage,
  SupportChatError,
} from '@/lib/api/support-chat';
import { useMutation } from '@tanstack/react-query';
import { KeyboardEvent, useState } from 'react';

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [lastFailedText, setLastFailedText] = useState<string | null>(null);
  const [escalated, setEscalated] = useState(false);

  const mutation = useMutation({
    mutationFn: (text: string) => sendSupportChatMessage(text, sessionId),
    onMutate: (text: string) => {
      setLastFailedText(null);
      setMessages((prev) => [
        ...prev,
        {
          id: `temp-${Date.now()}`,
          sessionId: sessionId ?? '',
          role: 'USER',
          body: text,
          createdAt: new Date().toISOString(),
        },
      ]);
    },
    onSuccess: (data) => {
      setSessionId(data.sessionId);
      setMessages((prev) => [...prev, data.reply]);
      setEscalated(data.escalated);
    },
    onError: (_error, text) => {
      setLastFailedText(text);
    },
  });

  const errorMessage =
    mutation.error instanceof SupportChatError
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
    if (event.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {isOpen && (
        <div
          role="dialog"
          aria-label="แชทกับผู้ช่วย BidNest"
          className="mb-3 flex w-80 flex-col rounded-2xl border bg-white shadow-xl"
        >
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="font-medium">ผู้ช่วย BidNest</span>
            <button aria-label="ปิดแชท" onClick={() => setIsOpen(false)}>
              ✕
            </button>
          </div>

          <MessageList messages={messages} isPending={mutation.isPending} />

          {escalated && (
            <div className="px-4 pb-2 text-sm text-amber-700">
              ดูเหมือนคำถามนี้ยากเกินไปสำหรับผู้ช่วย AI —
              แนะนำให้ติดต่อแอดมินโดยตรง
            </div>
          )}

          {mutation.isError && lastFailedText && (
            <div className="px-4 pb-2 text-sm text-red-600">
              {errorMessage}{' '}
              <button
                className="underline"
                onClick={() => mutation.mutate(lastFailedText)}
              >
                ลองใหม่
              </button>
            </div>
          )}

          <div className="flex items-center gap-2 border-t p-3">
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="พิมพ์คำถาม..."
              className="flex-1 rounded-full border px-3 py-2 text-sm outline-none"
            />
            <button
              onClick={handleSend}
              disabled={mutation.isPending}
              className="rounded-full bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              ส่ง
            </button>
          </div>
        </div>
      )}

      <button
        aria-label="เปิดแชทช่วยเหลือ"
        onClick={() => setIsOpen((prev) => !prev)}
        className="rounded-full bg-blue-600 p-4 text-xl text-white shadow-lg"
      >
        💬
      </button>
    </div>
  );
}

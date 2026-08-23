'use client';

import { MessageBubble } from '@/components/chat-widget/message-bubble';
import TypingDots from '@/components/chat-widget/typing-dots';
import { ChatMessage } from '@/lib/api/support-chat';
import { useEffect, useRef } from 'react';

interface MessageListProps {
  messages: ChatMessage[];
  isPending: boolean;
}

export default function MessageList({ messages, isPending }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isPending]);

  return (
    <div
      aria-live="polite"
      className="flex flex-col gap-3 overflow-y-auto p-4"
      style={{ maxHeight: 360 }}
    >
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
      {isPending && <TypingDots />}
      <div ref={bottomRef} />
    </div>
  );
}

'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { MessageCircle, Sparkles, X } from 'lucide-react';

import { ConversationPreview } from '@/components/chat-widget/conversation-preview';
import { SupportChatPanel } from '@/components/chat-widget/support-chat-panel';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Mode = 'AI' | 'CHAT';

/**
 * AI-001 / CHAT-004 — one floating widget, two modes picked by a small tab
 * bar: the AI assistant (works signed out) and a preview of buyer-seller
 * threads (CHAT-004, full page at /chat). Same corner both ways, so a
 * visitor only ever has one thing to notice in that corner of the screen.
 *
 * Absent under /admin: neither mode is an admin tool, and an admin working
 * the dashboard is not the audience either one is written for.
 */
export function ChatWidget() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('AI');

  if (pathname?.startsWith('/admin')) return null;

  return (
    <div className="fixed right-6 bottom-6 z-50">
      {isOpen && (
        <div
          role="dialog"
          aria-label="แชท BidNest"
          className="mb-3 flex w-80 flex-col overflow-hidden rounded-r4 border border-n-200 bg-white shadow-sh2"
        >
          <div className="flex items-center justify-between border-b border-n-200 px-4 py-3">
            <span className="font-display text-sm font-bold text-ink">
              {mode === 'AI' ? 'ผู้ช่วย BidNest' : 'ข้อความ'}
            </span>
            <button
              type="button"
              aria-label="ปิดแชท"
              onClick={() => setIsOpen(false)}
              className="text-n-500 hover:text-ink"
            >
              <X className="size-5" />
            </button>
          </div>

          <div className="flex border-b border-n-200 px-2 pt-2">
            <TabButton
              active={mode === 'AI'}
              onClick={() => setMode('AI')}
              icon={<Sparkles className="size-4" />}
              label="ผู้ช่วย AI"
            />
            <TabButton
              active={mode === 'CHAT'}
              onClick={() => setMode('CHAT')}
              icon={<MessageCircle className="size-4" />}
              label="แชท"
            />
          </div>

          {mode === 'AI' ? <SupportChatPanel /> : <ConversationPreview />}
        </div>
      )}

      <Button
        variant="dark"
        size="icon"
        pill
        aria-label={isOpen ? 'ปิดแชท' : 'เปิดแชท'}
        onClick={() => setIsOpen((prev) => !prev)}
        className="size-14 shadow-sh2"
      >
        {isOpen ? <X className="size-6" /> : <MessageCircle className="size-6" />}
      </Button>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-1 items-center justify-center gap-1.5 rounded-t-r2 px-3 py-2 text-xs font-semibold transition-colors',
        active
          ? 'border-b-2 border-amber-500 text-ink'
          : 'border-b-2 border-transparent text-n-500 hover:text-n-700'
      )}
    >
      {icon}
      {label}
    </button>
  );
}

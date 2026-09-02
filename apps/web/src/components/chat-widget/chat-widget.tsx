'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { MessageCircle, Sparkles, X } from 'lucide-react';

import { ConversationPreview } from '@/components/chat-widget/conversation-preview';
import { SupportChatPanel } from '@/components/chat-widget/support-chat-panel';
import { Button } from '@/components/ui/button';
import { useAuthToken } from '@/lib/api/auth/use-auth-token';
import {
  ChatMessage,
  SupportSessionStatus,
  fetchSupportChatHistory,
} from '@/lib/api/support-chat';
import { useSupportSessionRoom } from '@/lib/use-support-session-room';
import { isSessionUnread, markSessionSeen } from '@/lib/support-inbox-seen';
import { cn } from '@/lib/utils';

type Mode = 'AI' | 'CHAT';

const storageKey = (userId: string) => `bidnest_support_session:${userId}`;

/**
 * AI-001 / CHAT-004 — one floating widget, two modes picked by a small tab
 * bar: the AI assistant (works signed out) and a preview of buyer-seller
 * threads (CHAT-004, full page at /chat). Same corner both ways, so a
 * visitor only ever has one thing to notice in that corner of the screen.
 *
 * The AI session lives here, not inside SupportChatPanel — closing the
 * popover used to unmount the panel and lose the conversation outright.
 * Lifted up, it: (1) survives closing/reopening and navigating around the
 * site, rehydrated from the server via `sessionId` remembered in
 * sessionStorage per signed-in user (a different login = a different key,
 * so it never bleeds across accounts, and it clears itself the moment the
 * browser tab does — that's the "session" it's named for); (2) keeps
 * listening for the admin's replies even while the popover is closed, which
 * is what makes the unread dot on the launcher button possible.
 *
 * Absent under /admin: neither mode is an admin tool, and an admin working
 * the dashboard is not the audience either one is written for.
 */
export function ChatWidget() {
  const pathname = usePathname();
  const { token, ready } = useAuthToken();
  const { data: session } = useSession();
  const userId = session?.user?.id;

  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('AI');
  const [hasUnread, setHasUnread] = useState(false);

  const [sessionId, setSessionId] = useState<string | undefined>();
  const [sessionStatus, setSessionStatus] = useState<SupportSessionStatus>('AI_ONLY');
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Read via refs inside the realtime callback below so the callback's own
  // identity never has to change with them — changing it would tear down and
  // reopen the socket connection every time the popover opens or closes.
  const isOpenRef = useRef(isOpen);
  const modeRef = useRef(mode);
  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // Rehydrate once we know who's asking — a guest has no userId and so no
  // stored session to recover; nothing persists for one server-side either.
  useEffect(() => {
    if (!ready || !userId) return;
    const stored = sessionStorage.getItem(storageKey(userId));
    if (!stored) return;

    fetchSupportChatHistory(stored)
      .then((history) => {
        setSessionId(stored);
        setSessionStatus(history.status);
        setMessages(history.messages);

        // An admin reply that arrived while this tab was closed left no live
        // socket event to set the dot from — without this, reopening the
        // site after being replied to showed no unread badge at all.
        const last = history.messages.at(-1);
        if (last?.role === 'ADMIN' && isSessionUnread(stored, last.id)) {
          setHasUnread(true);
        }
      })
      .catch(() => {
        // Gone, or belongs to a session that no longer checks out — nothing
        // to recover, so stop trying next time too.
        sessionStorage.removeItem(storageKey(userId));
      });
  }, [ready, userId]);

  useEffect(() => {
    if (!userId || !sessionId) return;
    sessionStorage.setItem(storageKey(userId), sessionId);
  }, [userId, sessionId]);

  // The room broadcasts every message, including this viewer's own — those
  // are already appended optimistically in SupportChatPanel's `onMutate`,
  // so re-adding them here from the echo would show every message twice.
  const onAdminMessage = useCallback((raw: unknown) => {
    const message = raw as ChatMessage;
    if (message.role !== 'ADMIN') return;
    setMessages((prev) => [...prev, message]);
    if (!(isOpenRef.current && modeRef.current === 'AI')) {
      setHasUnread(true);
    }
  }, []);

  useSupportSessionRoom(
    sessionStatus !== 'AI_ONLY' ? sessionId : undefined,
    token,
    onAdminMessage,
  );

  // The single place that marks a session "seen" — covers opening the
  // widget, switching to the AI tab, and a new admin reply landing while
  // already on it, all at once, rather than duplicating the same write at
  // every call site that clears `hasUnread`.
  useEffect(() => {
    if (!(isOpen && mode === 'AI') || !sessionId) return;
    const last = messages.at(-1);
    if (last?.role === 'ADMIN') markSessionSeen(sessionId, last.id);
  }, [isOpen, mode, messages, sessionId]);

  // Opening on an unread reply jumps straight to the AI tab, since that's
  // presumably what the dot was about; opening with nothing unread leaves
  // whichever tab was last open alone.
  const handleOpen = () => {
    setIsOpen(true);
    if (hasUnread) {
      setMode('AI');
      setHasUnread(false);
    }
  };

  const handleSwitchTo = (next: Mode) => {
    setMode(next);
    if (next === 'AI') setHasUnread(false);
  };

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
              onClick={() => handleSwitchTo('AI')}
              icon={<Sparkles className="size-4" />}
              label="ผู้ช่วย AI"
              unread={hasUnread && mode !== 'AI'}
            />
            <TabButton
              active={mode === 'CHAT'}
              onClick={() => handleSwitchTo('CHAT')}
              icon={<MessageCircle className="size-4" />}
              label="แชท"
            />
          </div>

          {mode === 'AI' ? (
            <SupportChatPanel
              sessionId={sessionId}
              setSessionId={setSessionId}
              sessionStatus={sessionStatus}
              setSessionStatus={setSessionStatus}
              messages={messages}
              setMessages={setMessages}
            />
          ) : (
            <ConversationPreview />
          )}
        </div>
      )}

      {/* Hidden while open rather than turned into a second close (X): the
          panel's own header already has one, and showing both reads as two
          different close buttons for the same action. */}
      {!isOpen && (
        <Button
          variant="dark"
          size="icon"
          pill
          aria-label="เปิดแชท"
          onClick={handleOpen}
          className="relative size-14 shadow-sh2"
        >
          <MessageCircle className="size-6" />
          {hasUnread && (
            <span className="absolute top-1 right-1 size-3 rounded-full border-2 border-white bg-red" />
          )}
        </Button>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  unread,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  unread?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex flex-1 items-center justify-center gap-1.5 rounded-t-r2 px-3 py-2 text-xs font-semibold transition-colors',
        active
          ? 'border-b-2 border-amber-500 text-ink'
          : 'border-b-2 border-transparent text-n-500 hover:text-n-700'
      )}
    >
      {icon}
      {label}
      {unread && <span className="size-1.5 rounded-full bg-red" />}
    </button>
  );
}

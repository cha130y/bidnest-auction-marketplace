'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MessageSquare } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { loginHref } from '@/lib/api/auth/login-redirect';
import { useAuthToken } from '@/lib/api/auth/use-auth-token';
import { listConversations, type ConversationSummary } from '@/lib/api/chat';
import { useUserChannel } from '@/lib/use-user-channel';
import { cn } from '@/lib/utils';

const PREVIEW_LIMIT = 5;

/**
 * CHAT-004 — the widget's "แชท" tab. A preview only, on purpose: a full
 * thread (composer, history, live updates) belongs on its own page where it
 * has room, not squeezed into a 320px popover. Every row, and the "ดูทั้งหมด"
 * link, lead to /chat — this never opens a thread inline.
 */
export function ConversationPreview() {
  const router = useRouter();
  const { token, ready } = useAuthToken();
  const [conversations, setConversations] = useState<
    ConversationSummary[] | null
  >(null);

  const refresh = useCallback(() => {
    listConversations()
      .then(setConversations)
      .catch(() => {
        // The widget stays usable with an empty preview; /chat has the real
        // error state if something is actually wrong.
      });
  }, []);

  useUserChannel(ready ? token : null, refresh);

  if (!ready) return null;

  if (!token) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
        <p className="text-sm text-n-600">เข้าสู่ระบบเพื่อแชทกับผู้ซื้อ/ผู้ขาย</p>
        <Button variant="primary" size="sm" onClick={() => router.push(loginHref())}>
          เข้าสู่ระบบ
        </Button>
      </div>
    );
  }

  if (!conversations) {
    return <div className="h-40 animate-pulse bg-n-100" aria-hidden="true" />;
  }

  const preview = conversations.slice(0, PREVIEW_LIMIT);

  return (
    <div className="flex flex-col">
      {preview.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-n-500">
          ยังไม่มีบทสนทนา
        </p>
      ) : (
        <ol className="max-h-90 overflow-y-auto">
          {preview.map((conversation) => {
            const unread = conversation.unreadCount > 0;
            return (
              <li key={conversation.id} className="border-b border-n-200 last:border-b-0">
                <Link
                  href={`/chat/${conversation.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-n-100"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-r3 bg-n-100">
                    {conversation.listing.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- thumbnail from arbitrary uploaded-image hosts
                      <img
                        src={conversation.listing.imageUrl}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <MessageSquare className="size-4 text-n-400" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        'truncate text-sm',
                        unread ? 'font-semibold text-ink' : 'text-n-600'
                      )}
                    >
                      {conversation.counterpart.displayName ?? 'ผู้ใช้'}
                    </p>
                    <p className="truncate text-xs text-n-500">
                      {conversation.lastMessage?.body ?? conversation.listing.title}
                    </p>
                  </div>
                  {unread && (
                    <span className="size-2 shrink-0 rounded-full bg-amber-500" />
                  )}
                </Link>
              </li>
            );
          })}
        </ol>
      )}

      <Link
        href="/chat"
        className="border-t border-n-200 px-4 py-3 text-center text-sm font-semibold text-amber-600 hover:bg-n-100"
      >
        ดูข้อความทั้งหมด
      </Link>
    </div>
  );
}

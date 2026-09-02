'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Bot, Send } from 'lucide-react';
import {
  AdminSupportMessage,
  claimSupportSession,
  fetchAdminSupportSession,
  resolveSupportSession,
  sendAdminSupportMessage,
} from '@/lib/api/admin';
import { useAuthToken } from '@/lib/api/auth/use-auth-token';
import { useSupportSessionRoom } from '@/lib/use-support-session-room';
import { getSeenMessageId, markSessionSeen } from '@/lib/support-inbox-seen';
import { formatDateTime } from '@/lib/format';
import { ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const STATUS_LABEL: Record<string, string> = {
  AI_ONLY: 'คุยกับ AI',
  ESCALATED: 'รอตอบ',
  RESOLVED: 'ปิดเรื่องแล้ว',
};

/** The customer's own initial — a small circular avatar, LINE OA-style. */
function CustomerAvatar({ label }: { label: string }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700">
      {label.slice(0, 1).toUpperCase()}
    </span>
  );
}

function AssistantAvatar() {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-n-200 text-n-500">
      <Bot className="size-4" />
    </span>
  );
}

/**
 * One bubble, LINE OA-manager style: the admin's own replies are green and
 * flush right with no avatar (that's the "me" side of the console); the
 * customer's messages are white and flush left with their avatar; the AI's
 * prior turns sit in the same left column, muted, so the admin can read what
 * already happened without mistaking it for the customer's own words.
 */
function MessageRow({
  message,
  customerLabel,
}: {
  message: AdminSupportMessage;
  customerLabel: string;
}) {
  const fromAdmin = message.role === 'ADMIN';
  const fromAssistant = message.role === 'ASSISTANT';

  return (
    <div className={cn('flex items-end gap-2', fromAdmin && 'flex-row-reverse')}>
      {!fromAdmin && (fromAssistant ? <AssistantAvatar /> : <CustomerAvatar label={customerLabel} />)}

      <div className={cn('flex max-w-[70%] flex-col gap-1', fromAdmin ? 'items-end' : 'items-start')}>
        <div
          className={cn(
            'rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap',
            fromAdmin
              ? 'rounded-br-md bg-green text-white'
              : fromAssistant
                ? 'rounded-bl-md bg-n-200 text-n-600 italic'
                : 'rounded-bl-md bg-white text-ink shadow-sh1',
          )}
        >
          {message.body}
        </div>
        <span className="px-1 text-[10px] text-n-400">{formatDateTime(message.createdAt)}</span>
      </div>
    </div>
  );
}

/** Admin thread view for one AI-001 escalation — reply, claim, resolve. */
export function AdminSupportThread({ sessionId }: { sessionId: string }) {
  const queryClient = useQueryClient();
  const { token } = useAuthToken();
  const [reply, setReply] = useState('');
  const [liveMessages, setLiveMessages] = useState<AdminSupportMessage[]>([]);

  const queryKey = ['admin-support-session', sessionId];

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => fetchAdminSupportSession(sessionId),
  });

  const onLiveMessage = useCallback((raw: unknown) => {
    setLiveMessages((prev) => [...prev, raw as AdminSupportMessage]);
  }, []);

  useSupportSessionRoom(sessionId, token, onLiveMessage);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey });
    void queryClient.invalidateQueries({ queryKey: ['admin-support-sessions'] });
  };

  const claimMutation = useMutation({
    mutationFn: () => claimSupportSession(sessionId),
    onSuccess: invalidate,
  });

  const resolveMutation = useMutation({
    mutationFn: () => resolveSupportSession(sessionId),
    onSuccess: invalidate,
  });

  const replyMutation = useMutation({
    mutationFn: (body: string) => sendAdminSupportMessage(sessionId, body),
    onSuccess: () => {
      setReply('');
      invalidate();
    },
  });

  // The list is re-fetched after every mutation, so `bridgingMessages` only
  // ever bridges the gap between "the reply just landed over the socket" and
  // the next refetch settling — not a second source of truth. Dedupe by id:
  // a reply this admin just sent lands twice otherwise (once from
  // `invalidate()`'s refetch, once from the socket echo into the same room
  // this admin is also joined to), which crashes React on the duplicate key.
  // Computed with hooks (not inline in the JSX below) so it can run before
  // the loading/error returns further down, which the mark-as-seen effect
  // right after needs — hooks can't follow a conditional return.
  const existingIds = useMemo(
    () => new Set((data?.messages ?? []).map((message) => message.id)),
    [data],
  );
  const bridgingMessages = useMemo(
    () => liveMessages.filter((message) => !existingIds.has(message.id)),
    [liveMessages, existingIds],
  );
  const messages = useMemo(
    () => [...(data?.messages ?? []), ...bridgingMessages],
    [data, bridgingMessages],
  );

  // Marks this session "read" the moment its newest message is on screen —
  // covers both opening a session with unread messages and one more arriving
  // live while already open. Feeds the sidebar's unread badge (admin/layout.tsx),
  // which used to count every ESCALATED session regardless of whether an
  // admin had already seen it, so it never cleared until the case was
  // resolved outright.
  useEffect(() => {
    const latest = messages.at(-1);
    if (!latest || getSeenMessageId(sessionId) === latest.id) return;
    markSessionSeen(sessionId, latest.id);
    void queryClient.invalidateQueries({ queryKey: ['admin-support-sessions'] });
  }, [messages, sessionId, queryClient]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="text-sm text-red">
          {error instanceof ApiError ? error.message : 'โหลดบทสนทนาไม่สำเร็จ'}
        </CardContent>
      </Card>
    );
  }

  const customerLabel = data.user?.displayName ?? data.user?.email ?? '?';

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-r4 border border-n-200 bg-white shadow-sh1">
      <div className="flex items-center justify-between border-b border-n-200 px-5 py-4">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/support"
            aria-label="กลับไปหน้ารายการ"
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-n-500 hover:bg-n-100 lg:hidden"
          >
            <ArrowLeft className="size-4.5" />
          </Link>
          <CustomerAvatar label={customerLabel} />
          <div>
            <h1 className="font-display text-base font-bold text-ink">{customerLabel}</h1>
            <p className="text-xs text-n-500">
              {STATUS_LABEL[data.status] ?? data.status} ·{' '}
              {data.assignedAdmin
                ? `รับเรื่องโดย ${data.assignedAdmin.displayName ?? data.assignedAdmin.email}`
                : 'ยังไม่มีคนรับเรื่อง'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {!data.assignedAdmin && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => claimMutation.mutate()}
              disabled={claimMutation.isPending}
            >
              รับเรื่อง
            </Button>
          )}
          {data.status !== 'RESOLVED' && (
            <Button
              size="sm"
              variant="dark"
              onClick={() => resolveMutation.mutate()}
              disabled={resolveMutation.isPending}
            >
              ปิดเรื่อง
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto bg-n-100 px-4 py-4">
        {messages.map((message) => (
          <MessageRow key={message.id} message={message} customerLabel={customerLabel} />
        ))}
      </div>

      <div className="flex items-center gap-2 border-t border-n-200 px-4 py-3">
        <input
          value={reply}
          onChange={(event) => setReply(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && reply.trim()) {
              event.preventDefault();
              replyMutation.mutate(reply.trim());
            }
          }}
          placeholder="พิมพ์ข้อความตอบกลับ..."
          className="h-11 flex-1 rounded-full border border-n-300 bg-n-100 px-4 text-sm text-ink outline-none focus:border-green focus:bg-white"
        />
        <Button
          variant="primary"
          size="icon"
          className="rounded-full"
          aria-label="ส่ง"
          onClick={() => reply.trim() && replyMutation.mutate(reply.trim())}
          disabled={replyMutation.isPending || !reply.trim()}
        >
          <Send className="size-4" />
        </Button>
      </div>
      {replyMutation.isError && (
        <p className="px-4 pb-3 text-sm text-red">
          {replyMutation.error instanceof ApiError
            ? replyMutation.error.message
            : 'ส่งข้อความไม่สำเร็จ'}
        </p>
      )}
    </div>
  );
}

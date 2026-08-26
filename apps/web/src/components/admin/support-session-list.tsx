'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AdminSupportSessionSummary, SupportSessionStatus, fetchAdminSupportSessions } from '@/lib/api/admin';
import { formatDateTime } from '@/lib/format';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

const STATUS_DOT: Record<SupportSessionStatus, string> = {
  AI_ONLY: 'bg-n-400',
  ESCALATED: 'bg-amber-500',
  RESOLVED: 'bg-green',
};

const STATUS_LABEL: Record<SupportSessionStatus, string> = {
  AI_ONLY: 'คุยกับ AI',
  ESCALATED: 'รอตอบ',
  RESOLVED: 'ปิดแล้ว',
};

function SessionRow({
  session,
  active,
}: {
  session: AdminSupportSessionSummary;
  active: boolean;
}) {
  const label = session.user?.displayName ?? session.user?.email ?? '?';
  const unclaimed = session.status === 'ESCALATED' && !session.assignedAdmin;

  return (
    <Link
      href={`/admin/support/${session.id}`}
      className={cn(
        'flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-n-100',
        active && 'bg-amber-50 hover:bg-amber-50',
      )}
    >
      <span className="relative flex size-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-sm font-bold text-amber-700">
        {label.slice(0, 1).toUpperCase()}
        {unclaimed && (
          <span className="absolute -top-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full border-2 border-white bg-amber-500" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-semibold text-ink">{label}</p>
          <span className="shrink-0 text-[11px] text-n-400">
            {formatDateTime(session.lastMessage?.createdAt ?? session.createdAt)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`size-1.5 shrink-0 rounded-full ${STATUS_DOT[session.status]}`} />
          <p className="truncate text-xs text-n-500">
            {session.lastMessage?.body ?? STATUS_LABEL[session.status]}
          </p>
        </div>
      </div>
    </Link>
  );
}

/**
 * The left pane of the LINE OA-manager-style split view — a persistent list
 * next to whichever thread `[sessionId]/page.tsx` is currently rendering in
 * the layout's other pane, not a page you navigate away from.
 */
export function SupportSessionList({ activeSessionId }: { activeSessionId?: string }) {
  const [statusFilter, setStatusFilter] = useState<SupportSessionStatus>('ESCALATED');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-support-sessions', statusFilter],
    queryFn: () => fetchAdminSupportSessions({ status: statusFilter }),
  });

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-n-200 p-3">
        <Select
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value as SupportSessionStatus)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ESCALATED">รอตอบ (ESCALATED)</SelectItem>
            <SelectItem value="RESOLVED">ปิดแล้ว (RESOLVED)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex flex-col gap-2 p-3">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : data && data.length > 0 ? (
          <div className="flex flex-col divide-y divide-n-200">
            {data.map((session) => (
              <SessionRow key={session.id} session={session} active={session.id === activeSessionId} />
            ))}
          </div>
        ) : (
          <p className="p-8 text-center text-sm text-n-500">ไม่มีบทสนทนาในสถานะนี้</p>
        )}
      </div>
    </div>
  );
}

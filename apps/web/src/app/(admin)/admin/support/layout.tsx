'use client';

import { useSelectedLayoutSegment } from 'next/navigation';
import { SupportSessionList } from '@/components/admin/support-session-list';
import { cn } from '@/lib/utils';

/**
 * LINE OA Manager-style split view: the conversation list stays on screen
 * while `children` swaps between the empty state (`page.tsx`, nothing
 * selected) and a thread (`[sessionId]/page.tsx`) — no navigating away from
 * the list to read one.
 *
 * `useSelectedLayoutSegment` reads which child route is active without this
 * layout needing `sessionId` threaded down to it — it isn't the segment that
 * owns that param, `[sessionId]/page.tsx` is.
 */
export default function AdminSupportLayout({ children }: { children: React.ReactNode }) {
  const activeSessionId = useSelectedLayoutSegment() ?? undefined;

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Below lg there's only room for one pane — list-only until a thread
          is picked, then thread-only, the way a mail app collapses on mobile. */}
      <div
        className={cn(
          'w-full shrink-0 overflow-hidden rounded-r4 border border-n-200 bg-white shadow-sh1 lg:w-80',
          activeSessionId && 'hidden lg:block',
        )}
      >
        <SupportSessionList activeSessionId={activeSessionId} />
      </div>
      <div className={cn('min-w-0 flex-1', !activeSessionId && 'hidden lg:block')}>{children}</div>
    </div>
  );
}

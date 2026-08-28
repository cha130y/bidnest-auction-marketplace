'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider } from 'next-auth/react';

import { SessionAvatarSync } from '@/components/auth/session-avatar-sync';
import { SessionWatch } from '@/components/auth/session-watch';

/**
 * React Query's own defaults, changed in two places.
 *
 * `staleTime: 0` and `refetchOnWindowFocus: true` are what a bare
 * `new QueryClient()` gives you, and together they mean every long-lived query
 * refires whenever the tab regains focus. Four of ours are long-lived — they
 * are mounted by providers in the root and (shop) layouts, so they outlive
 * every client-side navigation and never unmount:
 *
 *   GET /cart
 *   GET /watchlist/products?limit=100
 *   GET /watchlist?limit=100
 *   GET /notifications/unread-count
 *
 * So alt-tabbing back to the browser costs four round trips, every time, on a
 * page the reader has not touched. On this machine that is ~180ms and easy to
 * miss; on a phone it is four requests before anything can be read.
 *
 * `refetchOnWindowFocus: false` is safe here specifically because the parts
 * that must not go stale do not depend on it: `useUserChannel` invalidates on
 * the server's own `notification:created` and `order:status_changed`, and
 * every mutation invalidates what it changed. Refetching on focus is a guess
 * that something might have changed; those two know.
 *
 * 30s rather than something larger: it is long enough to cover a tab switch
 * and a navigation, short enough that a page left open still catches up on its
 * next real remount.
 */
const queryDefaults = {
  queries: {
    staleTime: 30_000,
    refetchOnWindowFocus: false
  }
};

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: queryDefaults })
  );
  return (
    <SessionProvider>
      {/* AUTH-004 — signs out once renewal is no longer possible. */}
      <SessionWatch />
      {/* USR-001 — gives a session signed in before this shipped its picture. */}
      <SessionAvatarSync />
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </SessionProvider>
  );
}

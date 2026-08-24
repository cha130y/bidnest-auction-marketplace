'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider } from 'next-auth/react';

import { SessionTokenBridge } from '@/components/auth/session-token-bridge';

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <SessionProvider>
      {/* Mirrors the session's access token into the synchronous helper the
          rest of the app reads. Renders nothing. */}
      <SessionTokenBridge />
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </SessionProvider>
  );
}

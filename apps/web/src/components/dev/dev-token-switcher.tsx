'use client';

import { useState } from 'react';
import { signIn, signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';

/**
 * Dev-only identity switcher — a real login now exists at /login, but signing
 * in as a seeded user through it means fetching an emailed code every time,
 * which is more ceremony than checking an admin screen deserves.
 *
 * The tokens below are pre-minted (7-day expiry, `sub` = seed.ts user id,
 * signed with the same JWT_ACCESS_SECRET as apps/api) — see
 * dev5-admin-frontend-summary.md for how to re-mint them once they expire or
 * the secret rotates. Never ships to production: gated on NODE_ENV.
 *
 * Since AUTH-008 the token lives in the NextAuth session rather than in
 * localStorage, so switching goes through the `oauth-tokens` provider — the
 * same one the Google and Line screens use to turn an already-issued token
 * pair into a session. Nothing here writes storage any more.
 */
/** `sub` in each token matches the seeded user it names. */
const DEV_USERS = {
  ADMIN: {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'admin@bidnest.test',
    displayName: 'BidNest Admin',
    role: 'ADMIN' as const
  },
  BUYER: {
    id: '00000000-0000-4000-8000-000000000004',
    email: 'buyer@bidnest.test',
    displayName: 'Anan B.',
    role: 'USER' as const
  }
};

const DEV_TOKENS = {
  ADMIN:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDEiLCJpYXQiOjE3ODc1NDM4NDQsImV4cCI6MTc4ODE0ODY0NH0.PPZpFsi3ud3JJSnauYEErbXYBLqcrsQjYdi1eia7-lY',
  BUYER:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDQiLCJpYXQiOjE3ODc1NDM4NDQsImV4cCI6MTc4ODE0ODY0NH0.zepyWkeWw28cxPo1OcBziQ9uOJ2D_l3KXC8TQv74j3Y',
} as const;

export function DevTokenSwitcher() {
  const [open, setOpen] = useState(false);

  if (process.env.NODE_ENV === 'production') return null;

  const switchTo = (which: keyof typeof DEV_USERS) =>
    signIn('oauth-tokens', {
      payload: JSON.stringify({
        accessToken: DEV_TOKENS[which],
        // Refresh is unused here: the point is to be a given user for a
        // minute, not to keep a session alive across an expiry.
        refreshToken: '',
        user: DEV_USERS[which]
      }),
      callbackUrl: window.location.href
    });

  return (
    <div className="fixed bottom-4 left-4 z-50 font-body text-sm">
      {open && (
        <div className="mb-2 flex flex-col gap-2 rounded-r3 border border-n-200 bg-white p-3 shadow-sh2">
          <span className="text-xs font-semibold text-n-500">DEV: สลับ identity</span>
          <Button size="sm" variant="primary" onClick={() => switchTo('ADMIN')}>
            เข้าเป็น Admin
          </Button>
          <Button size="sm" variant="secondary" onClick={() => switchTo('BUYER')}>
            เข้าเป็น Buyer ธรรมดา
          </Button>
          <Button size="sm" variant="ghost" onClick={() => signOut()}>
            ออกจากระบบ
          </Button>
        </div>
      )}
      <Button size="sm" variant="dark" pill onClick={() => setOpen((prev) => !prev)}>
        🛠 DEV
      </Button>
    </div>
  );
}

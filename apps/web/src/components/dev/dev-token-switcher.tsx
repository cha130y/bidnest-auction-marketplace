'use client';

import { useState } from 'react';
import { clearAuthToken, setAuthToken } from '@/lib/api/auth/token';
import { Button } from '@/components/ui/button';

/**
 * Dev-only identity switcher — there is no login page yet (Dev1's NextAuth
 * work is still pending, see lib/api/auth/login-redirect.ts), so this is the
 * fastest way to test any auth-gated screen as a specific seeded user without
 * opening devtools every time.
 *
 * The tokens below are pre-minted (7-day expiry, `sub` = seed.ts user id,
 * signed with the same JWT_ACCESS_SECRET as apps/api) — see
 * dev5-admin-frontend-summary.md for how to re-mint them once they expire or
 * the secret rotates. Never ships to production: gated on NODE_ENV.
 *
 * A full reload (not just calling setAuthToken) is required after switching:
 * useAuthToken() only re-reads localStorage on the browser `storage` event,
 * which the spec fires for *other* tabs only, never the tab that made the
 * write. A reload is the simplest way to get this tab's own state consistent.
 */
const DEV_TOKENS = {
  ADMIN:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDEiLCJpYXQiOjE3ODc1NDM4NDQsImV4cCI6MTc4ODE0ODY0NH0.PPZpFsi3ud3JJSnauYEErbXYBLqcrsQjYdi1eia7-lY',
  BUYER:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDQiLCJpYXQiOjE3ODc1NDM4NDQsImV4cCI6MTc4ODE0ODY0NH0.zepyWkeWw28cxPo1OcBziQ9uOJ2D_l3KXC8TQv74j3Y',
} as const;

export function DevTokenSwitcher() {
  const [open, setOpen] = useState(false);

  if (process.env.NODE_ENV === 'production') return null;

  const switchTo = (token: string) => {
    setAuthToken(token);
    window.location.reload();
  };

  const signOut = () => {
    clearAuthToken();
    window.location.reload();
  };

  return (
    <div className="fixed bottom-4 left-4 z-50 font-body text-sm">
      {open && (
        <div className="mb-2 flex flex-col gap-2 rounded-r3 border border-n-200 bg-white p-3 shadow-sh2">
          <span className="text-xs font-semibold text-n-500">DEV: สลับ identity</span>
          <Button size="sm" variant="primary" onClick={() => switchTo(DEV_TOKENS.ADMIN)}>
            เข้าเป็น Admin
          </Button>
          <Button size="sm" variant="secondary" onClick={() => switchTo(DEV_TOKENS.BUYER)}>
            เข้าเป็น Buyer ธรรมดา
          </Button>
          <Button size="sm" variant="ghost" onClick={signOut}>
            ล้าง token (ออกจากระบบ)
          </Button>
        </div>
      )}
      <Button size="sm" variant="dark" pill onClick={() => setOpen((prev) => !prev)}>
        🛠 DEV
      </Button>
    </div>
  );
}

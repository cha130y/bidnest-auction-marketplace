'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchCurrentUser } from '@/lib/api/admin';
import { useAuthToken } from '@/lib/api/auth/use-auth-token';
import { loginHref } from '@/lib/api/auth/login-redirect';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { DevTokenSwitcher } from '@/components/dev/dev-token-switcher';

const NAV_ITEMS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/users', label: 'Users (ADM-002)' },
  { href: '/admin/audit-log', label: 'Audit Log (ADM-004)' },
  { href: '/admin/auctions', label: 'Auctions (ADM-001)' },
  { href: '/admin/products', label: 'Products (ADM-005)' },
  { href: '/admin/orders', label: 'Orders (ADM-006)' },
  { href: '/admin/categories', label: 'Categories (ADM-003)' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { token, ready } = useAuthToken();

  const { data: currentUser, isLoading } = useQuery({
    queryKey: ['current-user'],
    queryFn: fetchCurrentUser,
    enabled: ready && !!token,
    retry: false,
  });

  // `ready` means "localStorage has been read", not "signed in" — wait for
  // both before deciding anything, same as SellerShell.
  if (!ready || (token && isLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-n-100">
        <Skeleton className="h-8 w-48" />
        <DevTokenSwitcher />
      </div>
    );
  }

  // No real login page yet (Dev1's NextAuth work is still pending) —
  // loginHref() lands on a 404 on purpose until it ships. Use the DEV
  // switcher below instead while testing.
  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-n-100">
        <Card className="max-w-sm px-6 py-16 text-center">
          <p className="text-n-600">เข้าสู่ระบบด้วยบัญชี Admin เพื่อเข้าหน้านี้</p>
          <Button
            variant="primary"
            size="lg"
            className="mt-4"
            onClick={() => router.push(loginHref())}
          >
            เข้าสู่ระบบ
          </Button>
        </Card>
        <DevTokenSwitcher />
      </div>
    );
  }

  if (!currentUser || currentUser.role !== 'ADMIN') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-n-100">
        <p className="text-n-600">คุณไม่มีสิทธิ์เข้าถึงหน้านี้ (ต้องเป็นบัญชี Admin)</p>
        <DevTokenSwitcher />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-n-100">
      <aside className="w-56 shrink-0 border-r border-n-200 bg-white p-4">
        <div className="mb-6 font-display font-semibold text-ink">BidNest Admin</div>
        <nav className="flex flex-col gap-2">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-r3 px-3 py-2 text-sm text-n-700 hover:bg-n-100"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex-1">
        <header className="border-b border-n-200 bg-white p-4 text-sm text-n-500">
          Admin Dashboard
        </header>
        <main className="p-6">{children}</main>
      </div>
      <DevTokenSwitcher />
    </div>
  );
}

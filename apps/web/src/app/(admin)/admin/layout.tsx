'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useQuery } from '@tanstack/react-query';
import {
  FolderTree,
  Gavel,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  Menu,
  Package,
  ScrollText,
  ShoppingBag,
  Users,
} from 'lucide-react';
import { fetchCurrentUser } from '@/lib/api/admin';
import { useAuthToken } from '@/lib/api/auth/use-auth-token';
import { loginHref } from '@/lib/api/auth/login-redirect';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { DevTokenSwitcher } from '@/components/dev/dev-token-switcher';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  {
    href: '/admin',
    label: 'Overview',
    description: 'ศูนย์รวม endpoint แอดมินของทั้งทีม',
    icon: LayoutDashboard,
  },
  {
    href: '/admin/users',
    label: 'Users',
    description: 'ดูรายชื่อผู้ใช้ suspend/reactivate บัญชี',
    icon: Users,
  },
  {
    href: '/admin/audit-log',
    label: 'Audit Log',
    description: 'ดู log การกระทำของ admin ทั้งหมด กรองตาม action type',
    icon: ScrollText,
  },
  {
    href: '/admin/auctions',
    label: 'Auctions',
    description: 'ดูรายการประมูลทุกสถานะ ยกเลิกประมูลได้ (พร้อมเหตุผล)',
    icon: Gavel,
  },
  {
    href: '/admin/products',
    label: 'Products',
    description: 'ปิด/เปิดการขายสินค้า',
    icon: Package,
  },
  {
    href: '/admin/orders',
    label: 'Orders',
    description: 'ดูคำสั่งซื้อทั้งหมด อ่านอย่างเดียว',
    icon: ShoppingBag,
  },
  {
    href: '/admin/categories',
    label: 'Categories',
    description: 'จัดการหมวดหมู่ที่ใช้ร่วมกันทั้งประมูลและ e-commerce',
    icon: FolderTree,
  },
  {
    href: '/admin/support',
    label: 'Support Chat',
    description: 'ตอบแชทลูกค้าที่ AI ตอบไม่ได้',
    icon: MessageCircle,
  },
];

function useCurrentNavItem() {
  const pathname = usePathname();
  return (
    NAV_ITEMS.find((item) =>
      item.href === '/admin' ? pathname === item.href : pathname?.startsWith(item.href)
    ) ?? NAV_ITEMS[0]
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { token, ready } = useAuthToken();
  const currentItem = useCurrentNavItem();

  const { data: currentUser, isLoading } = useQuery({
    queryKey: ['current-user'],
    queryFn: fetchCurrentUser,
    enabled: ready && !!token,
    retry: false,
  });

  // `ready` means "the session has been read", not "signed in" — wait for
  // both before deciding anything, same as SellerShell.
  if (!ready || (token && isLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-n-100">
        <Skeleton className="h-8 w-48" />
        <DevTokenSwitcher />
      </div>
    );
  }

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
    <div className="flex min-h-screen flex-col bg-n-100 lg:flex-row">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-n-200 bg-white lg:flex">
        <div className="flex items-center gap-2 px-5 py-6">
          <span className="flex size-9 items-center justify-center rounded-r3 bg-linear-to-b from-amber-400 to-amber-500 font-display text-lg font-extrabold text-ink shadow-sh1">
            B
          </span>
          <div className="leading-tight">
            <p className="font-display text-base font-bold text-ink">BidNest</p>
            <p className="text-xs text-n-500">Admin</p>
          </div>
        </div>

        <nav className="flex flex-col gap-1 px-3">
          {NAV_ITEMS.map((item) => {
            const active = item === currentItem;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-r3 px-3 py-2.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-amber-50 text-amber-700'
                    : 'text-n-600 hover:bg-n-100 hover:text-ink'
                )}
              >
                <Icon
                  className={cn('size-4.5 shrink-0', active ? 'text-amber-600' : 'text-n-400')}
                />
                <span className="flex-1">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <Link
          href="/admin/account"
          className="mt-auto flex items-center gap-3 border-t border-n-200 px-5 py-4 transition-colors hover:bg-n-100"
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-n-100 text-xs font-bold text-n-600">
            {currentUser.email.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-xs font-semibold text-ink">{currentUser.email}</p>
            <p className="text-[11px] text-n-500">ADMIN</p>
          </div>
        </Link>

        <button
          type="button"
          onClick={() => void signOut({ callbackUrl: '/' })}
          className="flex items-center gap-3 border-t border-n-200 px-5 py-3 text-sm font-medium text-n-600 transition-colors hover:bg-red-50 hover:text-red"
        >
          <LogOut className="size-4.5 shrink-0 text-n-400" />
          ออกจากระบบ
        </button>
      </aside>

      <header className="flex items-center gap-3 border-b border-n-200 bg-white px-4 py-3 lg:hidden">
        <Sheet>
          <SheetTrigger
            render={
              <button
                type="button"
                aria-label="เปิดเมนู"
                className="flex size-10 shrink-0 items-center justify-center rounded-r2 text-ink hover:bg-n-100"
              />
            }
          >
            <Menu className="size-5" />
          </SheetTrigger>
          <SheetContent side="left" className="flex flex-col p-0">
            <SheetHeader className="border-b border-n-200">
              <SheetTitle>เมนู</SheetTitle>
            </SheetHeader>

            <nav className="flex flex-col gap-1 px-3 py-3">
              {NAV_ITEMS.map((item) => {
                const active = item === currentItem;
                const Icon = item.icon;
                return (
                  <SheetClose
                    key={item.href}
                    render={<Link href={item.href} />}
                    nativeButton={false}
                    className={cn(
                      'flex items-center gap-3 rounded-r3 px-3 py-2.5 text-sm font-medium transition-colors',
                      active
                        ? 'bg-amber-50 text-amber-700'
                        : 'text-n-600 hover:bg-n-100 hover:text-ink'
                    )}
                  >
                    <Icon
                      className={cn(
                        'size-4.5 shrink-0',
                        active ? 'text-amber-600' : 'text-n-400'
                      )}
                    />
                    <span className="flex-1">{item.label}</span>
                  </SheetClose>
                );
              })}
            </nav>

            <SheetClose
              render={<Link href="/admin/account" />}
              nativeButton={false}
              className="mt-auto flex items-center gap-3 border-t border-n-200 px-5 py-4 transition-colors hover:bg-n-100"
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-n-100 text-xs font-bold text-n-600">
                {currentUser.email.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1 text-left leading-tight">
                <p className="truncate text-xs font-semibold text-ink">{currentUser.email}</p>
                <p className="text-[11px] text-n-500">ADMIN</p>
              </div>
            </SheetClose>

            <SheetClose
              onClick={() => void signOut({ callbackUrl: '/' })}
              className="flex items-center gap-3 border-t border-n-200 px-5 py-3 text-sm font-medium text-n-600 transition-colors hover:bg-red-50 hover:text-red"
            >
              <LogOut className="size-4.5 shrink-0 text-n-400" />
              ออกจากระบบ
            </SheetClose>
          </SheetContent>
        </Sheet>

        <div className="flex items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-r3 bg-linear-to-b from-amber-400 to-amber-500 font-display text-sm font-extrabold text-ink shadow-sh1">
            B
          </span>
          <p className="font-display text-sm font-bold text-ink">BidNest Admin</p>
        </div>
      </header>

      <div className="flex flex-1 flex-col">
        <header className="hidden items-center justify-between border-b border-n-200 bg-white px-6 py-4 lg:flex">
          <div>
            <h1 className="font-display text-lg font-bold text-ink">{currentItem.label}</h1>
            <p className="text-xs text-n-500">{currentItem.description}</p>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>

      <DevTokenSwitcher />
    </div>
  );
}

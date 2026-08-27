'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  FolderTree,
  Gavel,
  Package,
  ScrollText,
  ShoppingBag,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { fetchAdminOverview } from '@/lib/api/admin';
import { formatTHB } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const SECTIONS: {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
}[] = [
  {
    href: '/admin/users',
    title: 'Users',
    description: 'ดูรายชื่อผู้ใช้ suspend/reactivate บัญชี',
    icon: Users,
  },
  {
    href: '/admin/audit-log',
    title: 'Audit Log',
    description: 'ดู log การกระทำของ admin ทั้งหมด กรองตาม action type',
    icon: ScrollText,
  },
  {
    href: '/admin/auctions',
    title: 'Auctions',
    description: 'ดูรายการประมูลทุกสถานะ ยกเลิกประมูลได้ (พร้อมเหตุผล)',
    icon: Gavel,
  },
  {
    href: '/admin/products',
    title: 'Products',
    description: 'ปิด/เปิดการขายสินค้า',
    icon: Package,
  },
  {
    href: '/admin/orders',
    title: 'Orders',
    description: 'ดูคำสั่งซื้อทั้งหมด อ่านอย่างเดียว',
    icon: ShoppingBag,
  },
  {
    href: '/admin/categories',
    title: 'Categories',
    description: 'จัดการหมวดหมู่ที่ใช้ร่วมกันทั้งประมูลและ e-commerce',
    icon: FolderTree,
  },
];

export default function AdminOverviewPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-overview'],
    queryFn: fetchAdminOverview,
  });

  const stats = data && [
    {
      label: 'ผู้ใช้ทั้งหมด',
      value: data.users.total.toLocaleString('th-TH'),
      hint: `${data.users.suspended.toLocaleString('th-TH')} ถูกระงับ`,
      icon: Users,
    },
    {
      label: 'ประมูลที่กำลังดำเนินอยู่',
      value: data.auctions.active.toLocaleString('th-TH'),
      hint: `${data.auctions.total.toLocaleString('th-TH')} รายการทั้งหมด`,
      icon: Gavel,
    },
    {
      label: 'สินค้าที่เปิดขายอยู่',
      value: data.products.active.toLocaleString('th-TH'),
      hint: `${data.products.total.toLocaleString('th-TH')} รายการทั้งหมด`,
      icon: Package,
    },
    {
      label: 'ยอดขายที่ชำระแล้ว',
      value: formatTHB(data.orders.paidTotal),
      hint: `${data.orders.paidCount.toLocaleString('th-TH')} คำสั่งซื้อ`,
      icon: ShoppingBag,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading || !stats
          ? Array.from({ length: 4 }, (_, index) => (
              <Card key={index}>
                <CardContent className="flex flex-col gap-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-7 w-16" />
                </CardContent>
              </Card>
            ))
          : stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <Card key={stat.label}>
                  <CardContent className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-n-500">{stat.label}</p>
                      <p className="mt-1 font-display text-2xl font-extrabold text-ink">
                        {stat.value}
                      </p>
                      <p className="mt-1 text-xs text-n-400">{stat.hint}</p>
                    </div>
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-r3 bg-amber-50 text-amber-600">
                      <Icon className="size-4.5" />
                    </span>
                  </CardContent>
                </Card>
              );
            })}
      </div>

      {data && (
        <p className="flex items-center gap-1.5 text-xs text-n-500">
          <Activity className="size-3.5" />
          admin ทำรายการ {data.adminActionsLast24h.toLocaleString('th-TH')} ครั้งใน 24 ชั่วโมงที่ผ่านมา
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <Link key={section.href} href={section.href} className="group">
              <Card className="h-full transition-all group-hover:-translate-y-0.5 group-hover:shadow-sh2">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-r3 bg-amber-50 text-amber-600">
                      <Icon className="size-5" />
                    </span>
                    <CardTitle className="text-base">{section.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="text-sm text-n-600">
                  <p>{section.description}</p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

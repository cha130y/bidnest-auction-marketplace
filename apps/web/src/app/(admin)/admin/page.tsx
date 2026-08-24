import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const SECTIONS = [
  {
    href: '/admin/users',
    title: 'Users (ADM-002)',
    description: 'ดูรายชื่อผู้ใช้ suspend/reactivate บัญชี',
    owner: 'Dev 5',
  },
  {
    href: '/admin/audit-log',
    title: 'Audit Log (ADM-004)',
    description: 'ดู log การกระทำของ admin ทั้งหมด กรองตาม action type',
    owner: 'Dev 5',
  },
  {
    href: '/admin/auctions',
    title: 'Auctions (ADM-001)',
    description: 'ดูรายการประมูลทุกสถานะ ยกเลิกประมูลได้ (พร้อมเหตุผล)',
    owner: 'Dev 4',
  },
  {
    href: '/admin/products',
    title: 'Products (ADM-005)',
    description: 'ปิด/เปิดการขายสินค้า (list ยังรอ backend implement)',
    owner: 'Dev 3',
  },
  {
    href: '/admin/orders',
    title: 'Orders (ADM-006)',
    description: 'ดูคำสั่งซื้อทั้งหมด อ่านอย่างเดียว',
    owner: 'Dev 3',
  },
  {
    href: '/admin/categories',
    title: 'Categories (ADM-003)',
    description: 'จัดการหมวดหมู่ที่ใช้ร่วมกันทั้งประมูลและ e-commerce',
    owner: 'Dev 2',
  },
];

export default function AdminOverviewPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl font-bold text-ink">Overview</h1>
      <p className="max-w-2xl text-sm text-n-600">
        ยังไม่มี endpoint สรุปตัวเลข (<code>/admin/overview</code>) ในระบบจริง — ไม่ใส่การ์ด
        ตัวเลขมั่ว ศูนย์รวมทุก endpoint แอดมินของทั้ง 4 คน (ตาม ADR-0001 — admin role เดียว
        ครอบทั้งสองโมดูล) อยู่ด้านล่างนี้แทน
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((section) => (
          <Link key={section.href} href={section.href}>
            <Card className="h-full transition-shadow hover:shadow-sh2">
              <CardHeader>
                <CardTitle>{section.title}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm text-n-600">
                <p>{section.description}</p>
                <span className="text-xs text-n-400">Backend: {section.owner}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

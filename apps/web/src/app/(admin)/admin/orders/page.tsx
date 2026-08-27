'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { OrderStatus } from '@/lib/api/types';
import { AdminOrderSummary, listAdminOrders } from '@/lib/api/admin';
import { createDataTableColumnHelper, DataTable } from '@/components/admin/data-table';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const STATUS_OPTIONS: OrderStatus[] = ['PENDING', 'PAID', 'CANCELLED'];

const columnHelper = createDataTableColumnHelper<AdminOrderSummary>();

export default function AdminOrdersPage() {
  const [status, setStatus] = useState<OrderStatus | undefined>();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-orders', status, page],
    queryFn: () => listAdminOrders({ status, page, limit: 20 }),
  });

  const columns = useMemo(
    () => [
      columnHelper.accessor('checkoutSessionId', { header: 'Checkout Session' }),
      columnHelper.accessor('status', { header: 'สถานะ' }),
      columnHelper.accessor('subtotal', { header: 'ยอดรวม' }),
      columnHelper.accessor('itemCount', { header: 'จำนวนชิ้น' }),
      columnHelper.display({
        id: 'buyer',
        header: 'ผู้ซื้อ',
        cell: ({ row }) => row.original.buyer.displayName ?? row.original.buyer.email,
      }),
      columnHelper.display({
        id: 'seller',
        header: 'ผู้ขาย',
        cell: ({ row }) => row.original.seller.displayName ?? row.original.seller.email,
      }),
      columnHelper.accessor('shipmentStatus', { header: 'สถานะจัดส่ง' }),
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl font-bold text-ink">Orders</h1>

      <Select
        value={status ?? ''}
        onValueChange={(value) => {
          setStatus((value || undefined) as OrderStatus | undefined);
          setPage(1);
        }}
      >
        <SelectTrigger className="w-52">
          <SelectValue placeholder="ทุกสถานะ" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">ทุกสถานะ</SelectItem>
          {STATUS_OPTIONS.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Card>
        {isLoading ? (
          <div className="flex flex-col gap-2 p-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          <DataTable columns={columns} data={data?.items ?? []} />
        )}
      </Card>

      {data && data.meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-n-600">
          <Button
            size="sm"
            variant="secondary"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            ก่อนหน้า
          </Button>
          <span>
            หน้า {data.meta.page} / {data.meta.totalPages}
          </span>
          <Button
            size="sm"
            variant="secondary"
            disabled={page >= data.meta.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            ถัดไป
          </Button>
        </div>
      )}
    </div>
  );
}

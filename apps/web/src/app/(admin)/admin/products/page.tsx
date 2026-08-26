'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AdminProductRow,
  deactivateAdminProduct,
  fetchAdminProducts,
  reactivateAdminProduct,
} from '@/lib/api/admin';
import { ApiError } from '@/lib/api/client';
import { createDataTableColumnHelper, DataTable } from '@/components/admin/data-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const columnHelper = createDataTableColumnHelper<AdminProductRow>();

const STATUS_STYLE: Record<AdminProductRow['status'], string> = {
  ACTIVE: 'bg-green-50 text-green',
  INACTIVE: 'bg-n-100 text-n-500',
  OUT_OF_STOCK: 'bg-amber-50 text-amber-600',
  REMOVED: 'bg-n-100 text-n-500',
  SUSPENDED: 'bg-red-50 text-red',
};

function StatusPill({ status }: { status: AdminProductRow['status'] }) {
  return (
    <span
      className={`inline-flex h-6.5 items-center rounded-full px-3 text-xs font-semibold ${STATUS_STYLE[status]}`}
    >
      {status}
    </span>
  );
}

export default function AdminProductsPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<AdminProductRow['status'] | undefined>();
  const [reason, setReason] = useState<Record<string, string>>({});

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-products', statusFilter],
    queryFn: () => fetchAdminProducts({ status: statusFilter }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-products'] });

  const deactivateMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      deactivateAdminProduct(id, reason),
    onSuccess: invalidate,
  });

  const reactivateMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      reactivateAdminProduct(id, reason),
    onSuccess: invalidate,
  });

  const busy = deactivateMutation.isPending || reactivateMutation.isPending;

  const columns = useMemo(
    () => [
      columnHelper.accessor('title', { header: 'สินค้า' }),
      columnHelper.accessor((row) => row.seller.displayName ?? row.seller.email, {
        id: 'seller',
        header: 'ร้านค้า',
      }),
      columnHelper.accessor('stockQty', { header: 'สต็อก' }),
      columnHelper.accessor('status', {
        header: 'สถานะ',
        cell: ({ getValue }) => <StatusPill status={getValue()} />,
      }),
      columnHelper.display({
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const product = row.original;
          const productReason = reason[product.id] ?? '';
          return (
            <div className="flex items-center gap-2">
              <input
                value={productReason}
                onChange={(event) =>
                  setReason((prev) => ({ ...prev, [product.id]: event.target.value }))
                }
                placeholder="เหตุผล"
                className="h-9 w-32 rounded-r2 border border-n-300 px-2 text-xs outline-none focus:border-amber-500"
              />
              {product.status === 'SUSPENDED' ? (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!productReason.trim() || busy}
                  onClick={() =>
                    reactivateMutation.mutate({ id: product.id, reason: productReason })
                  }
                >
                  เปิดขาย
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="danger"
                  disabled={!productReason.trim() || busy}
                  onClick={() =>
                    deactivateMutation.mutate({ id: product.id, reason: productReason })
                  }
                >
                  ปิดขาย
                </Button>
              )}
            </div>
          );
        },
      }),
    ],
    [reason, busy, deactivateMutation, reactivateMutation],
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl font-bold text-ink">Products</h1>

      <Select
        value={statusFilter ?? ''}
        onValueChange={(value) =>
          setStatusFilter((value || undefined) as AdminProductRow['status'] | undefined)
        }
      >
        <SelectTrigger className="w-52">
          <SelectValue placeholder="ทุกสถานะ" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">ทุกสถานะ</SelectItem>
          <SelectItem value="ACTIVE">ACTIVE</SelectItem>
          <SelectItem value="OUT_OF_STOCK">OUT_OF_STOCK</SelectItem>
          <SelectItem value="SUSPENDED">SUSPENDED</SelectItem>
          <SelectItem value="INACTIVE">INACTIVE</SelectItem>
          <SelectItem value="REMOVED">REMOVED</SelectItem>
        </SelectContent>
      </Select>

      {error && (
        <Card className="border border-red bg-red-50">
          <CardContent className="text-sm text-red">
            {error instanceof ApiError ? error.message : 'โหลดรายการสินค้าไม่สำเร็จ'}
          </CardContent>
        </Card>
      )}

      <Card>
        {isLoading ? (
          <div className="flex flex-col gap-2 p-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          <DataTable columns={columns} data={data ?? []} />
        )}
      </Card>
    </div>
  );
}

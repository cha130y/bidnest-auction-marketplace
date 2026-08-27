'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Auction } from '@/lib/api/types';
import {
  AdminAuctionStatus,
  cancelAdminAuction,
  fetchAdminAuctions,
} from '@/lib/api/admin';
import { createDataTableColumnHelper, DataTable } from '@/components/admin/data-table';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const CANCELLABLE: AdminAuctionStatus[] = ['DRAFT', 'SCHEDULED', 'ACTIVE'];
const STATUS_OPTIONS: AdminAuctionStatus[] = [
  'DRAFT',
  'SCHEDULED',
  'ACTIVE',
  'SOLD',
  'UNSOLD',
  'CANCELLED',
];

const columnHelper = createDataTableColumnHelper<Auction>();

export default function AdminAuctionsPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AdminAuctionStatus | undefined>();
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<Auction | null>(null);
  const [reason, setReason] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-auctions', status, page],
    queryFn: () => fetchAdminAuctions({ status, page, limit: 20 }),
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelAdminAuction(target!.id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-auctions'] });
      setTarget(null);
      setReason('');
    },
  });

  const columns = useMemo(
    () => [
      columnHelper.accessor('title', { header: 'ชื่อประมูล' }),
      columnHelper.accessor('status', { header: 'สถานะ' }),
      columnHelper.accessor('currentPrice', { header: 'ราคาปัจจุบัน' }),
      columnHelper.accessor('bidCount', { header: 'จำนวนบิด' }),
      columnHelper.display({
        id: 'seller',
        header: 'ผู้ขาย',
        cell: ({ row }) => row.original.seller.displayName ?? row.original.seller.id,
      }),
      columnHelper.display({
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const auction = row.original;
          if (!CANCELLABLE.includes(auction.status as AdminAuctionStatus)) return null;
          return (
            <Button size="sm" variant="danger" onClick={() => setTarget(auction)}>
              Cancel
            </Button>
          );
        },
      }),
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl font-bold text-ink">Auctions</h1>

      <Select
        value={status ?? ''}
        onValueChange={(value) => {
          setStatus((value || undefined) as AdminAuctionStatus | undefined);
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

      <Dialog open={target !== null} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ยกเลิกประมูล &quot;{target?.title}&quot;</DialogTitle>
          </DialogHeader>
          <Input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="เหตุผล (บังคับกรอก)"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTarget(null)}>
              ปิด
            </Button>
            <Button
              variant="danger"
              disabled={!reason.trim() || cancelMutation.isPending}
              onClick={() => cancelMutation.mutate()}
            >
              ยืนยันยกเลิก
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

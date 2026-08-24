'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ApiError,
} from '@/lib/api/client';
import {
  deactivateAdminProduct,
  fetchAdminProducts,
  reactivateAdminProduct,
} from '@/lib/api/admin';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default function AdminProductsPage() {
  const [productId, setProductId] = useState('');
  const [reason, setReason] = useState('');
  const [lastResult, setLastResult] = useState<string | null>(null);

  // 🚧 ADM-005 — GET /admin/products (Dev3) is still a stub as of 2026-08-24
  // (throws NotImplementedException). Kept wired up on purpose: the moment
  // Dev3 ships it, this table starts working with no FE change. Until then
  // the query below fails with a 501 and the catch block below explains why
  // instead of pretending nothing is wrong.
  const { error: listError } = useQuery({
    queryKey: ['admin-products'],
    queryFn: () => fetchAdminProducts(),
    retry: false,
  });

  const deactivateMutation = useMutation({
    mutationFn: () => deactivateAdminProduct(productId, reason),
    onSuccess: (product) => setLastResult(`ปิดการขาย "${product.title}" แล้ว (${product.status})`),
  });

  const reactivateMutation = useMutation({
    mutationFn: () => reactivateAdminProduct(productId, reason),
    onSuccess: (product) => setLastResult(`เปิดการขาย "${product.title}" แล้ว (${product.status})`),
  });

  const busy = deactivateMutation.isPending || reactivateMutation.isPending;
  const activeError = (deactivateMutation.error ?? reactivateMutation.error) as
    | ApiError
    | undefined;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl font-bold text-ink">Products (ADM-005)</h1>

      {listError && (
        <Card className="border border-amber-200 bg-amber-50">
          <CardContent className="text-sm text-amber-600">
            🚧 <code>GET /admin/products</code> (รายการสินค้าทั้งหมดสำหรับ moderate) ยังเป็น
            stub ฝั่ง backend (Dev3 ยังไม่ implement — `NotImplementedException`) ใช้ฟอร์ม
            &ldquo;ระงับ/เปิดขายด้วย Product ID&rdquo; ด้านล่างไปพลางก่อน หา Product ID ได้จาก Audit Log
            (ADM-004) หรือค้นหาสินค้า ACTIVE จากหน้าร้านสาธารณะ
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>ระงับ / เปิดขายด้วย Product ID</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Input
            value={productId}
            onChange={(event) => setProductId(event.target.value)}
            placeholder="Product ID (UUID)"
          />
          <Input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="เหตุผล (บังคับกรอก)"
          />
          <div className="flex gap-2">
            <Button
              variant="danger"
              disabled={!productId.trim() || !reason.trim() || busy}
              onClick={() => deactivateMutation.mutate()}
            >
              ปิดการขาย (Suspend)
            </Button>
            <Button
              variant="secondary"
              disabled={!productId.trim() || !reason.trim() || busy}
              onClick={() => reactivateMutation.mutate()}
            >
              เปิดการขายกลับ (Reactivate)
            </Button>
          </div>
          {lastResult && <p className="text-sm text-green">{lastResult}</p>}
          {activeError && (
            <p className="text-sm text-red">{activeError.message}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

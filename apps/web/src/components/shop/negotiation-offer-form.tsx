'use client';

import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { createOffer, type OfferResult } from '@/lib/api/ai-tools';
import { ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatTHB } from '@/lib/format';

/**
 * AI-003 — AI Negotiator (Optional, owner: Dev 5)
 *
 * Wired into product-purchase-panel.tsx, next to NegotiateButton. Shown on
 * every listing since the buyer-facing `Product` never carries
 * `negotiationFloor` (SRS §6) — there is no client-side signal to gate on, so
 * a listing with no floor set just answers "This listing does not accept
 * offers" on submit rather than the form being hidden up front.
 *
 * On ACCEPTED, `onAccepted` hands the caller the offer (with `acceptToken`)
 * so checkout (CART-004, Dev3) can use it — this component does not navigate
 * to checkout itself, and as of 2026-08-24 CART-004 does not yet call
 * `verifyAndConsumeAcceptToken()` to redeem it, so `onAccepted` is currently
 * unused here; the accepted-offer card still explains the countdown so the
 * buyer knows to check out in time.
 */
export function NegotiationOfferForm({
  productId,
  onAccepted
}: {
  productId: string;
  onAccepted?: (offer: OfferResult) => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const [offerAmount, setOfferAmount] = useState('');

  const mutation = useMutation({
    mutationFn: () => createOffer(productId, quantity, Number(offerAmount)),
    onSuccess: (offer) => {
      if (offer.decision === 'ACCEPTED') onAccepted?.(offer);
    }
  });

  const errorMessage =
    mutation.error instanceof ApiError
      ? mutation.error.message
      : 'ส่งข้อเสนอไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Input
          type="number"
          min={1}
          value={quantity}
          onChange={(event) => setQuantity(Number(event.target.value))}
          wrapperClassName="w-24"
          aria-label="จำนวน"
        />
        <Input
          type="number"
          min={0}
          placeholder="ราคาที่เสนอ (บาท)"
          value={offerAmount}
          onChange={(event) => setOfferAmount(event.target.value)}
        />
      </div>

      <Button
        type="button"
        variant="secondary"
        disabled={!offerAmount || Number(offerAmount) <= 0 || mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? 'กำลังส่งข้อเสนอ...' : 'เสนอราคา'}
      </Button>

      {mutation.isError && <p className="text-xs text-red">{errorMessage}</p>}

      {mutation.isSuccess && <OfferResultCard offer={mutation.data} />}
    </div>
  );
}

function OfferResultCard({ offer }: { offer: OfferResult }) {
  if (offer.decision === 'REJECTED') {
    return (
      <Card>
        <CardContent className="text-sm text-red">
          ผู้ขายไม่รับข้อเสนอนี้ ลองเสนอราคาที่สูงขึ้น
        </CardContent>
      </Card>
    );
  }

  if (offer.decision === 'COUNTERED') {
    return (
      <Card>
        <CardContent className="flex flex-col gap-1 text-sm text-n-700">
          <span>ระบบเสนอราคาต่อรองกลับมา:</span>
          <span className="text-lg font-semibold text-ink">
            {offer.counterAmount != null ? formatTHB(offer.counterAmount) : '—'}
          </span>
          <span className="text-xs text-n-400">
            ต้องการยอมรับราคานี้ ให้เสนอราคาใหม่ที่เท่ากับจำนวนนี้ (คูลดาวน์ 5 นาทีก่อนเสนอครั้งถัดไป)
          </span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-1 text-sm text-n-700">
        <span className="font-semibold text-green">ผู้ขายยอมรับข้อเสนอแล้ว 🎉</span>
        {offer.expiresAt && <CountdownNote expiresAt={offer.expiresAt} />}
        <span className="text-xs text-n-400">
          กด checkout ให้เสร็จภายในเวลานี้ — ต่อรองสำเร็จไม่ได้แปลว่าซื้อสำเร็จ
        </span>
      </CardContent>
    </Card>
  );
}

/**
 * `Date.now()` is impure — it cannot be called during render (see
 * react-hooks/purity). Ticks in an effect instead, which also gets a real
 * live-updating countdown instead of a number frozen at the render that
 * happened to show it.
 */
function CountdownNote({ expiresAt }: { expiresAt: string }) {
  const computeMinutesLeft = () =>
    Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 60_000));

  // Lazy initializer: React's own escape hatch for reading an impure value
  // (the current time) exactly once, to seed state rather than during render.
  const [minutesLeft, setMinutesLeft] = useState(computeMinutesLeft);

  useEffect(() => {
    // The effect only subscribes — it never calls setState synchronously in
    // its own body, only from the interval's callback, once external time
    // has actually moved on.
    const interval = setInterval(() => setMinutesLeft(computeMinutesLeft()), 30_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt]);

  return <span className="text-xs text-amber-600">เหลือเวลายืนยัน checkout: {minutesLeft} นาที</span>;
}

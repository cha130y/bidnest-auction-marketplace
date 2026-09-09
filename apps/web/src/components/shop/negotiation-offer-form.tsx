'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { createOffer, type OfferResult } from '@/lib/api/ai-tools';
import { ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatTHB } from '@/lib/format';
import { OFFER_PARAM } from '@/lib/cart-selection';
import { useOfferMinutesLeft } from '@/lib/use-offer-countdown';

/**
 * AI-003 — AI Negotiator (Optional, owner: Dev 5)
 *
 * Wired into product-purchase-panel.tsx, next to NegotiateButton. Shown on
 * every listing since the buyer-facing `Product` never carries
 * `negotiationFloor` (SRS §6) — there is no client-side signal to gate on, so
 * a listing with no floor set just answers "This listing does not accept
 * offers" on submit rather than the form being hidden up front.
 *
 * A negotiation now ends somewhere. Meeting the counter is a button rather
 * than an instruction to retype the number — the rule that makes that an
 * acceptance lives in NegotiatorService — and an accepted price leads to
 * checkout, which redeems it (CART-004). The SRS is explicit that the two are
 * separate steps: "การต่อรองราคาเองไม่ได้ทำให้การซื้อสำเร็จ", so nothing here
 * buys anything on its own.
 *
 * Leaving this card is no longer losing the offer: `PayableOffersBanner` reads
 * the same offers back from the server on the screens a buyer opens with money
 * in mind, so this is a shortcut rather than the only door.
 */
export function NegotiationOfferForm({ productId }: { productId: string }) {
  const [quantity, setQuantity] = useState(1);
  const [offerAmount, setOfferAmount] = useState('');

  const mutation = useMutation({
    // The amount is an argument rather than read from state, so the accept
    // button can send the counter without first writing it into the input the
    // buyer is looking at.
    mutationFn: (amount: number) => createOffer(productId, quantity, amount)
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
        onClick={() => mutation.mutate(Number(offerAmount))}
      >
        {mutation.isPending ? 'กำลังส่งข้อเสนอ...' : 'เสนอราคา'}
      </Button>

      {mutation.isError && <p className="text-xs text-red">{errorMessage}</p>}

      {mutation.isSuccess && (
        <OfferResultCard
          offer={mutation.data}
          agreedAmount={mutation.variables}
          quantity={quantity}
          pending={mutation.isPending}
          onAcceptCounter={(amount) => mutation.mutate(amount)}
        />
      )}
    </div>
  );
}

function OfferResultCard({
  offer,
  agreedAmount,
  quantity,
  pending,
  onAcceptCounter
}: {
  offer: OfferResult;
  agreedAmount: number;
  quantity: number;
  pending: boolean;
  onAcceptCounter: (amount: number) => void;
}) {
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
        <CardContent className="flex flex-col gap-2 text-sm text-n-700">
          <span>ระบบเสนอราคาต่อรองกลับมา:</span>
          <span className="text-lg font-semibold text-ink">
            {offer.counterAmount != null ? formatTHB(offer.counterAmount) : '—'}
          </span>

          {offer.counterAmount != null && (
            <>
              <Button
                type="button"
                variant="primary"
                disabled={pending}
                onClick={() => onAcceptCounter(offer.counterAmount as number)}
              >
                {pending ? 'กำลังยืนยัน...' : 'ยอมรับราคานี้'}
              </Button>
              <span className="text-xs text-n-400">
                กดยอมรับได้ทันที ไม่ติดคูลดาวน์ — หรือจะเสนอราคาใหม่ก็ได้
                (เสนอใหม่มีคูลดาวน์ 5 นาที)
              </span>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 text-sm text-n-700">
        <span className="font-semibold text-green">ผู้ขายยอมรับข้อเสนอแล้ว 🎉</span>

        <span className="text-lg font-semibold text-ink">
          {formatTHB(agreedAmount)}
          {quantity > 1 && (
            <span className="ml-1 text-sm font-normal text-n-500">
              × {quantity} ชิ้น
            </span>
          )}
        </span>

        {offer.expiresAt && <CountdownNote expiresAt={offer.expiresAt} />}

        {/*
          The id rather than the token: the checkout screen reads the offer
          back from `GET /offers/pending`, which answers only with this buyer's
          own, so nothing here has to travel through a URL or be kept in the
          tab. Leaving this page no longer strands the offer either — the
          banner on the cart, the checkout and the order list all offer it
          again until it lapses.
        */}
        <Button
          type="button"
          variant="primary"
          nativeButton={false}
          render={<Link href={`/checkout?${OFFER_PARAM}=${offer.id}`} />}
        >
          ชำระเงินในราคานี้
        </Button>

        <span className="text-xs text-n-400">
          ต่อรองสำเร็จไม่ได้แปลว่าซื้อสำเร็จ — ต้องชำระเงินให้เสร็จภายในเวลานี้
          และสินค้าต้องยังมีอยู่
        </span>
      </CardContent>
    </Card>
  );
}

function CountdownNote({ expiresAt }: { expiresAt: string }) {
  const minutesLeft = useOfferMinutesLeft(expiresAt);

  return (
    <span className="text-xs text-amber-600">
      เหลือเวลายืนยัน checkout: {minutesLeft} นาที
    </span>
  );
}

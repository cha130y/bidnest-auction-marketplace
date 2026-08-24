'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { requestPriceEstimate, type PriceEstimate } from '@/lib/api/ai-tools';
import { ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

/**
 * AI-002 — AI Price Estimator (Optional, owner: Dev 5)
 *
 * Wired into draft-detail-screen.tsx (the draft's own page, after at least
 * one photo is uploaded) rather than draft-form.tsx: the form has no
 * `auctionId` yet on creation, and the backend needs the draft's uploaded
 * images to look at.
 *
 * Requires the draft to already have at least one uploaded photo — the
 * backend 400s with a Thai message otherwise, which just renders as-is.
 */
export function PriceSuggestionButton({
  auctionId,
  onApply
}: {
  auctionId: string;
  onApply: (estimate: PriceEstimate) => void;
}) {
  const [applied, setApplied] = useState(false);

  const mutation = useMutation({
    mutationFn: () => requestPriceEstimate(auctionId),
    onSuccess: () => setApplied(false)
  });

  const errorMessage =
    mutation.error instanceof ApiError
      ? mutation.error.message
      : 'ขอคำแนะนำราคาไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="secondary"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
      >
        {mutation.isPending ? 'กำลังวิเคราะห์รูปภาพ...' : '✨ ขอคำแนะนำราคาจาก AI'}
      </Button>

      {mutation.isError && <p className="text-xs text-red">{errorMessage}</p>}

      {mutation.isSuccess && (
        <Card>
          <CardContent className="flex flex-col gap-1 text-sm text-n-700">
            <div>
              ราคาเริ่มต้นที่แนะนำ:{' '}
              <span className="font-semibold text-ink">
                {mutation.data.suggestedStartingPrice.toLocaleString()} บาท
              </span>
            </div>
            <div className="text-n-500">
              ช่วงราคาปิดประมูลโดยประมาณ:{' '}
              {mutation.data.estimatedClosingRangeLow.toLocaleString()}–
              {mutation.data.estimatedClosingRangeHigh.toLocaleString()} บาท
            </div>
            <p className="text-xs text-n-400">{mutation.data.reason}</p>
            <p className="text-xs text-n-400">
              *เป็นแค่คำแนะนำ ไม่ใช่การตีราคาหรือการรับประกันใดๆ
            </p>
            <Button
              type="button"
              variant="primary"
              size="sm"
              className="mt-1 w-fit"
              disabled={applied}
              onClick={() => {
                onApply(mutation.data);
                setApplied(true);
              }}
            >
              {applied ? 'ใช้ค่านี้แล้ว' : 'ใช้ค่านี้'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

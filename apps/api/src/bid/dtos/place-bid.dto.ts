import { IsNumber, IsPositive, IsUUID } from 'class-validator';

export class PlaceBidDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  /**
   * BID-001 / BID-002 — the caller's own id for this attempt, so a retry after
   * a dropped connection is recognised as the same bid rather than counted
   * twice. The column is unique, which is what makes that hold even when two
   * retries arrive together.
   */
  @IsUUID()
  clientRequestId: string;
}

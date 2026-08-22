import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator';

export class AdminCancelAuctionDto {
  /**
   * ADM-001 — "พร้อมบันทึกการกระทำและเหตุผลไว้". Required, unlike the seller's
   * own cancellation (AUC-006) where it is optional: a seller withdrawing
   * their own listing owes nobody an explanation, but an admin overriding
   * somebody else's auction is answerable for it, and the audit log is where
   * that answer lives.
   */
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}

import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator';

/**
 * AUC-006 — a seller cancelling their own auction may say why, but is not made
 * to. ADM-001 is the case where a reason is mandatory, and that is an admin
 * route with its own DTO.
 */
export class CancelAuctionDto {
  @Trim()
  @IsString()
  @IsOptional()
  @MaxLength(500)
  reason?: string;
}

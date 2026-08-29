import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator';

export class ModerateProductDto {
  // ADM-005 — every takedown and restore has to carry a reason for the audit log
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}

import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator';

export class ChangeUserStatusDto {
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

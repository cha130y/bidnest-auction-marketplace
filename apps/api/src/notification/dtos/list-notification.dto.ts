import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min
} from 'class-validator';
import { NotificationType } from '../../../generated/prisma/enums';

export class ListNotificationDto {
  // Accepts ?types=ORDER_PLACED&types=DELIVERED and ?types=ORDER_PLACED,DELIVERED
  @IsEnum(NotificationType, { each: true })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (Array.isArray(value)) return value as string[];
    if (typeof value === 'string') return value.split(',');
    return value;
  })
  types?: NotificationType[];

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    // Anything else falls through to @IsBoolean and becomes a 400 rather than
    // being read as "false", which would quietly return the wrong list.
    return value;
  })
  unreadOnly?: boolean;

  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  limit?: number;
}

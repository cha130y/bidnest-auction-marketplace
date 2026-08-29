import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { OrderStatus, ShipmentStatus } from '../../../generated/prisma/enums';

export class ListOrderDto {
  @IsEnum(OrderStatus)
  @IsOptional()
  status?: OrderStatus;

  /**
   * SHIP-001 — where the parcel has got to, which is a different question from
   * whether the order was paid for. A seller opens their order list to find
   * the ones still waiting to be packed, and every one of those is `PAID`, so
   * `status` alone cannot narrow it down.
   *
   * Several at once because the states a person groups together are not the
   * states the sequence is written in: "on its way" covers both `SHIPPED` and
   * `IN_TRANSIT`, and a filter that could only name one of them would hide
   * half the answer.
   *
   * Accepts ?shipmentStatus=SHIPPED&shipmentStatus=IN_TRANSIT and the comma
   * form, matching ListNotificationDto.types.
   */
  @IsEnum(ShipmentStatus, { each: true })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (Array.isArray(value)) return value as string[];
    if (typeof value === 'string') return value.split(',');
    return value;
  })
  shipmentStatus?: ShipmentStatus[];

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

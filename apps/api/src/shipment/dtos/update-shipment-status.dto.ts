import { IsEnum } from 'class-validator';
import { ShipmentStatus } from '../../../generated/prisma/enums';

export class UpdateShipmentStatusDto {
  @IsEnum(ShipmentStatus)
  status: ShipmentStatus;
}

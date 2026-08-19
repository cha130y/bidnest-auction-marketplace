import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpdateShipmentStatusDto } from './dtos/update-shipment-status.dto';
import { ShipmentService } from './shipment.service';

@Controller('orders')
export class ShipmentController {
  constructor(private readonly shipmentService: ShipmentService) {}

  @Get(':id/shipment')
  getTimeline(
    @Param('id', ParseUUIDPipe) orderId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.shipmentService.getTimeline(orderId, userId);
  }

  @Patch(':id/shipment')
  updateStatus(
    @Param('id', ParseUUIDPipe) orderId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateShipmentStatusDto,
  ) {
    return this.shipmentService.updateStatus(orderId, userId, dto.status);
  }
}

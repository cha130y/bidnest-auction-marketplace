import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CheckoutService } from './checkout.service';
import { CheckoutDto } from './dtos/checkout.dto';
import { ListOrderDto } from './dtos/list-order.dto';
import { OrderService } from './order.service';

@Controller('orders')
export class OrderController {
  constructor(
    private readonly orderService: OrderService,
    private readonly checkoutService: CheckoutService
  ) {}

  // SRS 2 — admins cannot check out
  @Roles('USER')
  @Post('checkout')
  @HttpCode(HttpStatus.CREATED)
  checkout(@CurrentUser('id') buyerId: string, @Body() dto: CheckoutDto) {
    return this.checkoutService.checkout(buyerId, dto);
  }

  @Get()
  listBought(@CurrentUser('id') buyerId: string, @Query() dto: ListOrderDto) {
    return this.orderService.listForBuyer(
      buyerId,
      dto.status,
      dto.page,
      dto.limit
    );
  }

  @Get('selling')
  listSold(@CurrentUser('id') sellerId: string, @Query() dto: ListOrderDto) {
    return this.orderService.listForSeller(
      sellerId,
      dto.status,
      dto.page,
      dto.limit
    );
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string
  ) {
    return this.orderService.findOne(id, userId);
  }
}

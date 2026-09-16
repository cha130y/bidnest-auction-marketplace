import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { ListOrderDto } from '../order/dtos/list-order.dto';
import { AdminOrdersService } from './orders.service';

/**
 * ADM-006 — Order overview (owner: Dev 3)
 *
 * **Read-only in V1** — there is no endpoint to edit or refund, because the SRS
 * states explicitly that dispute handling has been deferred. Do not add
 * POST/PATCH/DELETE to this controller without amending the SRS first.
 *
 * Nothing is written to admin_actions here, because reading is not a
 * "significant action" as ADM-004 defines it.
 */
@Roles('ADMIN')
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly adminOrdersService: AdminOrdersService) {}

  /**
   * query: status?, page?, limit?
   * Returns buyer, seller, status and total, paginated, per ADM-006
   */
  @Get()
  listOrders(@Query() dto: ListOrderDto) {
    return this.adminOrdersService.listOrders(dto.status, dto.page, dto.limit);
  }
}

import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { ListOrderDto } from '../order/dtos/list-order.dto';
import { AdminOrdersService } from './orders.service';

/**
 * ADM-006 — Order overview (owner: Dev 3)
 *
 * **Read-only เท่านั้นใน V1** — ไม่มี endpoint แก้ไขหรือคืนเงิน เพราะ SRS ระบุว่า
 * การจัดการข้อพิพาทถูกเลื่อนออกไปแล้วอย่างชัดเจน ห้ามเพิ่ม POST/PATCH/DELETE
 * ที่ controller นี้โดยไม่แก้ SRS ก่อน
 *
 * ไม่มีการเขียน admin_actions ที่นี่ เพราะการอ่านอย่างเดียวไม่ใช่ "การกระทำสำคัญ"
 * ตามนิยามของ ADM-004
 */
@Roles('ADMIN')
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly adminOrdersService: AdminOrdersService) {}

  /**
   * query: status?, page?, limit?
   * คืน buyer, seller, สถานะ, ยอดรวม แบบแบ่งหน้าตาม ADM-006
   */
  @Get()
  listOrders(@Query() dto: ListOrderDto) {
    return this.adminOrdersService.listOrders(dto.status, dto.page, dto.limit);
  }
}

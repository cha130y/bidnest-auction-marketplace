import { Controller, Get } from '@nestjs/common';
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
 *
 * TODO(Dev 3): เมื่อ AUTH-008 พร้อม ใส่ guard ที่ระดับ class
 *   `@UseGuards(AccessTokenGuard, RolesGuard)` + `@Roles(UserRole.ADMIN)`
 */
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly adminOrdersService: AdminOrdersService) {}

  /**
   * query: cursor?, limit?, status? (OrderStatus)
   * คืน buyer, seller, สถานะ, ยอดรวม แบบแบ่งหน้าตาม ADM-006
   */
  @Get()
  listOrders() {
    return this.adminOrdersService.listOrders();
  }
}

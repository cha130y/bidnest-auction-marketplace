import { Controller, Get } from '@nestjs/common';
import { AdminActionsService } from './actions.service';

/**
 * ADM-004 — Audit log viewer (owner: Dev 5)
 *
 * `admin_actions` เป็นตาราง audit **ตารางเดียว** ที่รองรับทั้งสองโมดูล
 * (มี targetUserId, auctionId, categoryId, productId อยู่ในแถวเดียวกัน)
 * นี่คือเหตุผลหลักข้อหนึ่งที่ไม่แยก Admin role ตามโมดูล — ดู ADR-0001
 *
 * controller นี้อ่านอย่างเดียว ส่วนการ **เขียน** audit เป็นหน้าที่ของแต่ละ
 * service ที่ทำ action นั้นๆ โดยเขียนใน transaction เดียวกับการเปลี่ยนข้อมูล
 * (Dev 2 = category, Dev 3 = product, Dev 4 = auction, Dev 5 = user)
 *
 * TODO(Dev 5): เมื่อ AUTH-008 พร้อม ใส่ guard ที่ระดับ class
 *   `@UseGuards(AccessTokenGuard, RolesGuard)` + `@Roles(UserRole.ADMIN)`
 */
@Controller('admin/actions')
export class AdminActionsController {
  constructor(private readonly adminActionsService: AdminActionsService) {}

  /**
   * query: cursor?, limit?, actionType? (AdminActionType)
   * คืน admin ที่ทำ, ประเภทการกระทำ, เป้าหมาย, หมายเหตุ, เวลา ตาม ADM-004
   */
  @Get()
  listActions() {
    return this.adminActionsService.listActions();
  }
}

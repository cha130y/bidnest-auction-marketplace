import { Controller, Get, Param, Patch } from '@nestjs/common';
import { AdminUsersService } from './users.service';

/**
 * ADM-002 — User management (owner: Dev 5)
 *
 * ผู้ใช้ที่ถูกระงับต้อง login ไม่ได้, สร้างประมูล/ลงขายสินค้าไม่ได้, ประมูลไม่ได้,
 * เพิ่มลงตะกร้าไม่ได้ และ checkout ไม่ได้ — การบังคับใช้กระจายอยู่ในโมดูลของ
 * Dev 2 (AUTH), Dev 3 (PROD/CART) และ Dev 4 (AUC/BID) โดยเช็คจาก
 * `users.status = ACTIVE` ไม่ใช่เช็คที่ controller นี้
 *
 * TODO(Dev 5): เมื่อ AUTH-008 พร้อม ใส่ guard ที่ระดับ class
 *   `@UseGuards(AccessTokenGuard, RolesGuard)` + `@Roles(UserRole.ADMIN)`
 *   (admin-only ทั้ง controller ต่างจาก CategoriesController ที่มี route สาธารณะ)
 * TODO(Dev 5): รับ adminUserId จาก `@CurrentUser()` ไม่ใช่จาก body
 */
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  /** query: cursor?, limit?, status? (ACTIVE | SUSPENDED | DEACTIVATED) */
  @Get()
  listUsers() {
    return this.adminUsersService.listUsers();
  }

  /** body: { note?: string } → users.status = SUSPENDED */
  @Patch(':userId/suspend')
  suspendUser(@Param('userId') userId: string) {
    return this.adminUsersService.changeUserStatus(userId, 'SUSPENDED');
  }

  /** body: { note?: string } → users.status = ACTIVE */
  @Patch(':userId/reactivate')
  reactivateUser(@Param('userId') userId: string) {
    return this.adminUsersService.changeUserStatus(userId, 'ACTIVE');
  }
}

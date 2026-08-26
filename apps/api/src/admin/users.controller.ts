import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ChangeOwnPasswordDto } from './dtos/change-own-password.dto';
import { ChangeUserStatusDto } from './dtos/change-user-status.dto';
import { ListAdminUsersDto } from './dtos/list-admin-users.dto';
import { AdminUsersService } from './users.service';

/**
 * ADM-002 — User management (owner: Dev 5)
 *
 * ผู้ใช้ที่ถูกระงับต้อง login ไม่ได้, สร้างประมูล/ลงขายสินค้าไม่ได้, ประมูลไม่ได้,
 * เพิ่มลงตะกร้าไม่ได้ และ checkout ไม่ได้ — การบังคับใช้กระจายอยู่ในโมดูลของ
 * Dev 2 (AUTH), Dev 3 (PROD/CART) และ Dev 4 (AUC/BID) โดยเช็คจาก
 * `users.status = ACTIVE` ไม่ใช่เช็คที่ controller นี้
 */
@Roles('ADMIN')
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  /** query: cursor?, limit?, status? (ACTIVE | SUSPENDED | DEACTIVATED), role? (USER | ADMIN) */
  @Get()
  listUsers(@Query() query: ListAdminUsersDto) {
    return this.adminUsersService.listUsers(query);
  }

  /**
   * body: { currentPassword, newPassword } — the caller's own password, not
   * another account's. Declared ahead of the `:userId` routes below so Nest
   * cannot ever match "me" as one.
   */
  @Patch('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  changeOwnPassword(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangeOwnPasswordDto
  ) {
    return this.adminUsersService.changeOwnPassword(
      userId,
      dto.currentPassword,
      dto.newPassword
    );
  }

  /** body: { note?: string } → users.status = SUSPENDED */
  @Patch(':userId/suspend')
  suspendUser(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser('id') adminId: string,
    @Body() dto?: ChangeUserStatusDto
  ) {
    return this.adminUsersService.changeUserStatus(
      adminId,
      userId,
      'SUSPENDED',
      dto?.note
    );
  }

  /** body: { note?: string } → users.status = ACTIVE */
  @Patch(':userId/reactivate')
  reactivateUser(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser('id') adminId: string,
    @Body() dto?: ChangeUserStatusDto
  ) {
    return this.adminUsersService.changeUserStatus(
      adminId,
      userId,
      'ACTIVE',
      dto?.note
    );
  }
}

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';
import { AdminActionType } from '../../generated/prisma/enums';
import type { UserStatus } from '../../generated/prisma/enums';
import { HashingService } from '../auth/hashing.service';
import { TokenService } from '../auth/token.service';
import { TrustedDeviceService } from '../auth/trusted-device.service';
import { PrismaService } from '../prisma/prisma.service';
import { ListAdminUsersDto } from './dtos/list-admin-users.dto';

/**
 * ADM-002 — User management (owner: Dev 5)
 *
 * `changeUserStatus` must write `admin_actions` in the same `$transaction` as
 * the `users.status` update (ADM-004), using AdminActionType SUSPEND_USER /
 * REACTIVATE_USER and setting `targetUserId` — see ADR-0001.
 *
 * Caution: suspending should also revoke that user's unexpired
 * `user_sessions`, otherwise access tokens already issued keep working until
 * they expire (coordinated with Dev 2 — AUTH-004).
 */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hashing: HashingService,
    private readonly tokens: TokenService,
    private readonly trustedDevices: TrustedDeviceService
  ) {}

  /**
   * Members and staff are told apart by the existing roles — no new role
   *
   * Takes the DTO itself rather than a private copy of its shape, so the
   * bounds written there cannot drift from what this method assumes. Every
   * field arrives validated: the controller is the only caller.
   */
  async listUsers(query: ListAdminUsersDto = {}) {
    const limit = query.limit ?? 20;

    return this.prisma.user.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.role ? { role: query.role } : {})
      },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        createdAt: true
        // Never select passwordHash
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {})
    });
  }

  async changeUserStatus(
    adminUserId: string,
    targetUserId: string,
    targetStatus: Extract<UserStatus, 'SUSPENDED' | 'ACTIVE'>,
    note?: string
  ) {
    if (adminUserId === targetUserId) {
      throw new ForbiddenException('ไม่สามารถระงับ/คืนสิทธิ์บัญชีตัวเองได้');
    }

    const existing = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true }
    });
    if (!existing) throw new NotFoundException('User not found');

    const actionType =
      targetStatus === 'SUSPENDED'
        ? AdminActionType.SUSPEND_USER
        : AdminActionType.REACTIVATE_USER;

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: targetUserId },
        data: { status: targetStatus },
        select: {
          id: true,
          email: true,
          role: true,
          status: true,
          createdAt: true
        }
      });

      // Write the audit log in the same transaction as the status change (per ADR-0001)
      await tx.adminAction.create({
        data: { adminUserId, actionType, targetUserId, note }
      });

      if (targetStatus === 'SUSPENDED') {
        // Revoke unexpired sessions so existing access tokens can't keep working until they expire
        await tx.userSession.updateMany({
          where: {
            userId: targetUserId,
            revokedAt: null,
            expiresAt: { gt: new Date() }
          },
          data: { revokedAt: new Date() }
        });
      }

      return user;
    });
  }

  /**
   * An admin's own password — not another admin action on someone else, so
   * no `admin_actions` row: ADM-004 logs what an admin did *to the system*,
   * and this is the same "change my own password" any account can do.
   *
   * Mirrors AUTH-005's own reset exactly: every other session and trusted
   * device is revoked, since an old password is exactly as untrustworthy
   * after a deliberate change as after a leaked one. The session carrying
   * this very request is left alone — its access token still has whatever
   * life it had, the same as a reset via emailed link does.
   */
  async changeOwnPassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true }
    });

    if (
      !user?.passwordHash ||
      !(await this.hashing.compare(currentPassword, user.passwordHash))
    ) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordHash = await this.hashing.hash(newPassword);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash }
    });
    await this.tokens.revokeAllSessions(userId);
    await this.trustedDevices.revokeAll(userId);
  }
}

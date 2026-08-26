import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';
import { AdminActionType } from '../../generated/prisma/enums';
import type { UserRole, UserStatus } from '../../generated/prisma/enums';
import { HashingService } from '../auth/hashing.service';
import { TokenService } from '../auth/token.service';
import { TrustedDeviceService } from '../auth/trusted-device.service';
import { PrismaService } from '../prisma/prisma.service';

interface ListUsersQuery {
  cursor?: string;
  limit?: number;
  status?: UserStatus;
  role?: UserRole;
}

/**
 * ADM-002 — User management (owner: Dev 5)
 *
 * `changeUserStatus` ต้องเขียน `admin_actions` ใน `$transaction` เดียวกับการ
 * อัปเดต `users.status` (ADM-004) โดยใช้ AdminActionType SUSPEND_USER /
 * REACTIVATE_USER และเซ็ต `targetUserId` — ดู ADR-0001
 *
 * ข้อควรระวัง: ตอน suspend ควรเพิกถอน `user_sessions` ที่ยังไม่หมดอายุของ
 * ผู้ใช้คนนั้นด้วย ไม่งั้น access token ที่ออกไปแล้วยังใช้ได้จนหมดอายุ
 * (ประสานกับ Dev 2 — AUTH-004)
 */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hashing: HashingService,
    private readonly tokens: TokenService,
    private readonly trustedDevices: TrustedDeviceService
  ) {}

  /** สมาชิก/พนักงาน แยกกันด้วย role ที่มีอยู่แล้ว — ไม่มี role ใหม่ */
  async listUsers(query: ListUsersQuery = {}) {
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
        // ห้าม select passwordHash เด็ดขาด
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

      // เขียน audit log ในทรานแซคชันเดียวกับการเปลี่ยนสถานะ (ตาม ADR-0001)
      await tx.adminAction.create({
        data: { adminUserId, actionType, targetUserId, note }
      });

      if (targetStatus === 'SUSPENDED') {
        // เพิกถอน session ที่ยังไม่หมดอายุ กัน access token เดิมใช้ต่อได้จนหมดอายุ
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

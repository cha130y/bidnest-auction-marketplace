import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AdminActionType } from '../../generated/prisma/enums';
import type { UserStatus } from '../../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

interface ListUsersQuery {
  cursor?: string;
  limit?: number;
  status?: UserStatus;
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
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(query: ListUsersQuery = {}) {
    const limit = query.limit ?? 20;

    return this.prisma.user.findMany({
      where: query.status ? { status: query.status } : undefined,
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
        select: { id: true, email: true, role: true, status: true, createdAt: true }
      });

      // เขียน audit log ในทรานแซคชันเดียวกับการเปลี่ยนสถานะ (ตาม ADR-0001)
      await tx.adminAction.create({
        data: { adminUserId, actionType, targetUserId, note }
      });

      if (targetStatus === 'SUSPENDED') {
        // เพิกถอน session ที่ยังไม่หมดอายุ กัน access token เดิมใช้ต่อได้จนหมดอายุ
        await tx.userSession.updateMany({
          where: { userId: targetUserId, revokedAt: null, expiresAt: { gt: new Date() } },
          data: { revokedAt: new Date() }
        });
      }

      return user;
    });
  }
}

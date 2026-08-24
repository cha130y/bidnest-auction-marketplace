import { Injectable } from '@nestjs/common';
import type { AdminActionType } from '../../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

interface ListActionsQuery {
  cursor?: string;
  limit?: number;
  actionType?: AdminActionType;
}

/**
 * ADM-004 — Audit log viewer (owner: Dev 5)
 *
 * อ่านอย่างเดียว — ห้ามมีเมธอดที่แก้ไขหรือลบ `admin_actions` เพราะจะทำให้
 * audit trail เชื่อถือไม่ได้ (SRS §6 บังคับให้บันทึก log การกระทำของ Admin
 * ที่เกี่ยวข้องกับความปลอดภัย)
 *
 * `admin_actions` มี index `[adminUserId, createdAt]` และ `[actionType, createdAt]`
 * อยู่แล้ว — cursor-based pagination ด้านล่างใช้ index เหล่านี้ผ่าน orderBy createdAt
 */
@Injectable()
export class AdminActionsService {
  constructor(private readonly prisma: PrismaService) {}

  async listActions(query: ListActionsQuery = {}) {
    const limit = query.limit ?? 20;

    return this.prisma.adminAction.findMany({
      where: query.actionType ? { actionType: query.actionType } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {})
    });
  }
}

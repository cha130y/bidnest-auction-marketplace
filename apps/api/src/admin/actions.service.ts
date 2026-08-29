import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ListAdminActionsDto } from './dtos/list-admin-actions.dto';

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

  /**
   * Takes the DTO itself rather than a private copy of its shape, so the
   * bounds written there cannot drift from what this method assumes. Every
   * field arrives validated: the controller is the only caller.
   */
  async listActions(query: ListAdminActionsDto = {}) {
    const limit = query.limit ?? 20;

    return this.prisma.adminAction.findMany({
      where: query.actionType ? { actionType: query.actionType } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {})
    });
  }
}

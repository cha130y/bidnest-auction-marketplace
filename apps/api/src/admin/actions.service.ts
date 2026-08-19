import { Injectable, NotImplementedException } from '@nestjs/common';

/**
 * ADM-004 — Audit log viewer (owner: Dev 5)
 *
 * อ่านอย่างเดียว — ห้ามมีเมธอดที่แก้ไขหรือลบ `admin_actions` เพราะจะทำให้
 * audit trail เชื่อถือไม่ได้ (SRS §6 บังคับให้บันทึก log การกระทำของ Admin
 * ที่เกี่ยวข้องกับความปลอดภัย)
 *
 * `admin_actions` มี index `[adminUserId, createdAt]` และ `[actionType, createdAt]`
 * อยู่แล้ว ให้ออกแบบ query/pagination ให้ใช้ index เหล่านี้
 */
@Injectable()
export class AdminActionsService {
  listActions(): never {
    throw new NotImplementedException('ADM-004 listActions');
  }
}

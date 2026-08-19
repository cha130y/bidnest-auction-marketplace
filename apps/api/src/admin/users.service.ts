import { Injectable, NotImplementedException } from '@nestjs/common';

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
  listUsers(): never {
    throw new NotImplementedException('ADM-002 listUsers');
  }

  changeUserStatus(targetUserId: string, targetStatus: string): never {
    throw new NotImplementedException(
      `ADM-002 changeUserStatus (targetUserId=${targetUserId}, targetStatus=${targetStatus})`,
    );
  }
}

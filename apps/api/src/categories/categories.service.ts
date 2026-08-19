import { Injectable, NotImplementedException } from '@nestjs/common';

/**
 * ADM-003 — Category management (owner: Dev 2)
 *
 * ทุกเมธอดที่เขียนข้อมูล **ต้อง** สร้างแถว `admin_actions` ใน `$transaction`
 * เดียวกันกับการเขียนหมวดหมู่ เพื่อให้ ADM-004 ถูกการันตีที่ระดับ database
 * (เป็นไปไม่ได้ที่จะมีการกระทำของ admin ที่ไม่มี audit log) — ดู ADR-0001
 *
 * ```ts
 * return this.prisma.$transaction(async (transaction) => {
 *   const category = await transaction.category.update({ ... });
 *   await transaction.adminAction.create({
 *     adminUserId: input.adminUserId,
 *     categoryId: category.id,
 *     actionType: AdminActionType.DEACTIVATE_CATEGORY,
 *     note: `Deactivated category "${category.name}"`,
 *   });
 *   return category;
 * });
 * ```
 *
 * AdminActionType ที่ต้องใช้: CREATE_CATEGORY, UPDATE_CATEGORY,
 * ACTIVATE_CATEGORY, DEACTIVATE_CATEGORY (มีครบใน schema แล้ว)
 */
@Injectable()
export class CategoriesService {
  /** public tree — where isActive = true ทั้ง root และ children */
  findActiveTree(): never {
    throw new NotImplementedException('ADM-003 findActiveTree');
  }

  /** admin tree — ไม่กรอง isActive */
  findAdminTree(): never {
    throw new NotImplementedException('ADM-003 findAdminTree');
  }

  /**
   * ต้องตรวจก่อนสร้าง:
   * - slug ที่สร้างจาก name ต้องไม่ว่าง และต้อง unique (จับ P2002 → 409)
   * - ถ้ามี parentId: parent ต้องมีอยู่, ต้องเป็น root, และต้อง isActive
   */
  createCategory(): never {
    throw new NotImplementedException('ADM-003 createCategory');
  }

  updateCategory(categoryId: string): never {
    throw new NotImplementedException(
      `ADM-003 updateCategory (categoryId=${categoryId})`,
    );
  }

  /**
   * เปิด/ปิดใช้งานหมวดหมู่
   * - ตอนเปิด: ถ้าเป็น child ต้องเช็คว่า parent active อยู่ก่อน
   * - ถ้าสถานะไม่เปลี่ยน ให้คืนค่าเดิมโดยไม่เขียน admin_actions ซ้ำ
   */
  setCategoryActivation(categoryId: string, isActive: boolean): never {
    throw new NotImplementedException(
      `ADM-003 setCategoryActivation (categoryId=${categoryId}, isActive=${isActive})`,
    );
  }
}

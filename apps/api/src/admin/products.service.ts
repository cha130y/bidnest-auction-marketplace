import { Injectable, NotImplementedException } from '@nestjs/common';

/**
 * ADM-005 — Product listing oversight (owner: Dev 3)
 *
 * `setProductActivation` ต้องเขียน `admin_actions` ใน `$transaction` เดียวกับ
 * การอัปเดต `products.status` (ADM-004) ด้วย AdminActionType
 * DEACTIVATE_PRODUCT / REACTIVATE_PRODUCT + productId + note
 *
 * - ปิด → `SUSPENDED` (ไม่ใช่ INACTIVE) เพราะ INACTIVE เป็นสถานะที่ผู้ขายเปิด
 *   กลับเองได้ตาม PROD-002 ซึ่งจะทำให้ ADM-005 ไม่มีผลบังคับ — ดู ADR-0002
 * - เปิดกลับ → `stockQty > 0 ? ACTIVE : OUT_OF_STOCK` (PROD-005)
 *
 * ห้ามแตะ orders ที่สถานะ PAID เด็ดขาด — ADM-005 ระบุว่าการปิดการขายปิดกั้น
 * เฉพาะคำสั่งซื้อใหม่
 *
 * ⚠️ งานที่ผูกกันอยู่ในโมดูล e-commerce ของ Dev 3 เอง (ADR-0002):
 *   - PROD-002 ผู้ขายเปลี่ยนสถานะ/แก้ข้อมูล/soft-delete → ถ้า `status === SUSPENDED`
 *     ต้อง 403 ทุกกรณี เช็คที่ **สถานะปัจจุบัน** ไม่ใช่สถานะปลายทาง ไม่งั้นผู้ขาย
 *     เดินอ้อม SUSPENDED → REMOVED → ACTIVE ได้ เพราะก้าวแรกลบร่องรอยการระงับทิ้ง
 *   - PROD-005 auto-flip ตอน stock เปลี่ยน → ต้องข้ามสินค้าที่ SUSPENDED
 *     ไม่งั้นการเติม stock จะปลดการระงับเองเงียบๆ
 *   - CART/checkout → สินค้า SUSPENDED เพิ่มลงตะกร้าและ checkout ไม่ได้
 */
@Injectable()
export class AdminProductsService {
  listProducts(): never {
    throw new NotImplementedException('ADM-005 listProducts');
  }

  setProductActivation(productId: string, isActive: boolean): never {
    throw new NotImplementedException(
      `ADM-005 setProductActivation (productId=${productId}, isActive=${isActive})`
    );
  }
}

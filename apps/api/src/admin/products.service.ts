import { Injectable, NotImplementedException } from '@nestjs/common';

/**
 * ADM-005 — Product listing oversight (owner: Dev 3)
 *
 * `setProductActivation` ต้องเขียน `admin_actions` ใน `$transaction` เดียวกับ
 * การอัปเดต `products.status` (ADM-004) ด้วย AdminActionType
 * DEACTIVATE_PRODUCT / REACTIVATE_PRODUCT + productId + note
 *
 * ตอน reactivate ต้องคืนสถานะให้ถูก: ถ้า stockQty = 0 ให้เป็น OUT_OF_STOCK
 * ไม่ใช่ ACTIVE (PROD-005)
 *
 * ห้ามแตะ orders ที่สถานะ PAID เด็ดขาด — ADM-005 ระบุว่าการปิดการขายปิดกั้น
 * เฉพาะคำสั่งซื้อใหม่
 */
@Injectable()
export class AdminProductsService {
  listProducts(): never {
    throw new NotImplementedException('ADM-005 listProducts');
  }

  setProductActivation(productId: string, isActive: boolean): never {
    throw new NotImplementedException(
      `ADM-005 setProductActivation (productId=${productId}, isActive=${isActive})`,
    );
  }
}

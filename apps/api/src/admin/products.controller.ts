import { Controller, Get, Param, Patch } from '@nestjs/common';
import { AdminProductsService } from './products.service';

/**
 * ADM-005 — Product listing oversight (owner: Dev 3)
 *
 * การปิดการขายจะปิดกั้นคำสั่งซื้อใหม่ แต่ **ไม่ยกเลิกคำสั่งซื้อที่จ่ายเงินแล้ว (PAID)**
 *
 * ⚠️ ประเด็นค้าง: ADM-005 ทับซ้อนกับ PROD-002 ที่ให้ผู้ขายแก้สถานะสินค้าของ
 * ตัวเองระหว่าง ACTIVE/INACTIVE ได้ ทำให้ผู้ขายกด ACTIVE กลับเองได้หลัง admin
 * สั่งปิด ต้องตกลงกันในทีมก่อนลงมือ — ดูหัวข้อ "ประเด็นค้าง" ใน ADR-0001
 *
 * TODO(Dev 3): เมื่อ AUTH-008 พร้อม ใส่ guard ที่ระดับ class
 *   `@UseGuards(AccessTokenGuard, RolesGuard)` + `@Roles(UserRole.ADMIN)`
 */
@Controller('admin/products')
export class AdminProductsController {
  constructor(private readonly adminProductsService: AdminProductsService) {}

  /** query: cursor?, limit?, status? (ProductStatus) */
  @Get()
  listProducts() {
    return this.adminProductsService.listProducts();
  }

  /** body: { reason: string } → products.status = INACTIVE */
  @Patch(':productId/deactivate')
  deactivateProduct(@Param('productId') productId: string) {
    return this.adminProductsService.setProductActivation(productId, false);
  }

  /** body: { reason: string } → products.status = ACTIVE (หรือ OUT_OF_STOCK ถ้า stockQty = 0) */
  @Patch(':productId/reactivate')
  reactivateProduct(@Param('productId') productId: string) {
    return this.adminProductsService.setProductActivation(productId, true);
  }
}

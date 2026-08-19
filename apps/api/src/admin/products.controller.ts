import { Controller, Get, Param, Patch } from '@nestjs/common';
import { AdminProductsService } from './products.service';

/**
 * ADM-005 — Product listing oversight (owner: Dev 3)
 *
 * การปิดการขายจะปิดกั้นคำสั่งซื้อใหม่ แต่ **ไม่ยกเลิกคำสั่งซื้อที่จ่ายเงินแล้ว (PAID)**
 *
 * admin สั่งปิด → `ProductStatus.SUSPENDED` ซึ่งเป็นสถานะที่ **ผู้ขายย้ายออกเองไม่ได้**
 * (ต่างจาก INACTIVE ที่ผู้ขายปิดเองและเปิดกลับเองได้ตาม PROD-002)
 * state machine เต็มและกฎที่ต้อง implement ทุกข้อดูที่ ADR-0002
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

  /** body: { reason: string } → products.status = SUSPENDED */
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

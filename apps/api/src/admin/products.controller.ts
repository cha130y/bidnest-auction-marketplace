import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ModerateProductDto } from './dtos/moderate-product.dto';
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
 * `@Roles('ADMIN')` ทำงานผ่าน RolesGuard ที่ลงทะเบียนเป็น APP_GUARD ใน AppModule
 * ตัวตนผู้เรียกมาจาก AccessTokenGuard (AUTH-008) — ตอนสลับจาก MockAuthGuard มา
 * ใช้ JWT จริง controller นี้ไม่ต้องแก้อะไรเลย เพราะอ่าน identity ผ่าน
 * `@CurrentUser()` อย่างเดียว
 */
@Roles('ADMIN')
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
  deactivateProduct(
    @Param('productId', ParseUUIDPipe) productId: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: ModerateProductDto
  ) {
    return this.adminProductsService.setProductActivation(
      productId,
      false,
      adminId,
      dto.reason
    );
  }

  /** body: { reason: string } → products.status = ACTIVE (หรือ OUT_OF_STOCK ถ้า stockQty = 0) */
  @Patch(':productId/reactivate')
  reactivateProduct(
    @Param('productId', ParseUUIDPipe) productId: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: ModerateProductDto
  ) {
    return this.adminProductsService.setProductActivation(
      productId,
      true,
      adminId,
      dto.reason
    );
  }
}

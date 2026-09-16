import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ListAdminProductsDto } from './dtos/list-admin-products.dto';
import { ModerateProductDto } from './dtos/moderate-product.dto';
import { AdminProductsService } from './products.service';

/**
 * ADM-005 — Product listing oversight (owner: Dev 3)
 *
 * Suspending a listing blocks new orders, but **does not cancel orders that are
 * already paid (PAID)**.
 *
 * An admin suspension → `ProductStatus.SUSPENDED`, a status that **the seller
 * cannot move out of on their own** (unlike INACTIVE, which the seller can set
 * and undo themselves per PROD-002). The full state machine and every rule that
 * must be implemented are in ADR-0002.
 *
 * `@Roles('ADMIN')` works through the RolesGuard registered as APP_GUARD in
 * AppModule. The caller's identity comes from AccessTokenGuard (AUTH-008) —
 * switching from MockAuthGuard to real JWTs needed no change here, because this
 * controller reads identity only through `@CurrentUser()`.
 */
@Roles('ADMIN')
@Controller('admin/products')
export class AdminProductsController {
  constructor(private readonly adminProductsService: AdminProductsService) {}

  /**
   * query: cursor?, limit?, status? — see ListAdminProductsDto.
   *
   * One DTO rather than three `@Query('name')` strings: the global
   * ValidationPipe only runs against a class metatype, so the string form was
   * unvalidated no matter what it was annotated with.
   */
  @Get()
  listProducts(@Query() query: ListAdminProductsDto) {
    return this.adminProductsService.listProducts(query);
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

  /** body: { reason: string } → products.status = ACTIVE (or OUT_OF_STOCK if stockQty = 0) */
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

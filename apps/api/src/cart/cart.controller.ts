import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CartService } from './cart.service';
import { AddCartItemDto } from './dtos/add-cart-item.dto';
import { UpdateCartItemDto } from './dtos/update-cart-item.dto';

// SRS 2 — an admin account cannot shop; the whole cart is off-limits to them
@Roles('USER')
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  getCart(@CurrentUser('id') userId: string) {
    return this.cartService.getCart(userId);
  }

  /**
   * CART-001 — adds to the quantity already in the cart rather than replacing
   * it, so pressing "เพิ่มลงตะกร้า" twice on a listing leaves two of it. Worth
   * saying out loud: the request looks like it sets a quantity, and the stock
   * ceiling is therefore checked against the resulting total, not against the
   * number in the body. `PATCH items/:itemId` is the one that sets.
   */
  @Post('items')
  addItem(@CurrentUser('id') userId: string, @Body() dto: AddCartItemDto) {
    return this.cartService.addItem(userId, dto.productId, dto.quantity);
  }

  // CART-002 — empties the cart. Removing lines one at a time still works and
  // is what the per-line bin does; this is for "start again".
  @Delete()
  clear(@CurrentUser('id') userId: string) {
    return this.cartService.clear(userId);
  }

  @Patch('items/:itemId')
  updateItem(
    @CurrentUser('id') userId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateCartItemDto
  ) {
    return this.cartService.updateItem(userId, itemId, dto.quantity);
  }

  @Delete('items/:itemId')
  removeItem(
    @CurrentUser('id') userId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string
  ) {
    return this.cartService.removeItem(userId, itemId);
  }
}

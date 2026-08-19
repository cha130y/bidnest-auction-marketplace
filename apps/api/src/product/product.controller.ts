import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateProductDto } from './dtos/create-product.dto';
import { SearchProductDto } from './dtos/search-product.dto';
import { UpdateProductDto } from './dtos/update-product.dto';
import { UpdateStockDto } from './dtos/update-stock.dto';
import { ProductService } from './product.service';

@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  // SRS 2 — admins moderate the marketplace, they never sell in it
  @Roles('USER')
  @Post()
  create(@CurrentUser('id') sellerId: string, @Body() dto: CreateProductDto) {
    return this.productService.create(sellerId, dto);
  }

  @Public()
  @Get()
  search(@Query() dto: SearchProductDto) {
    return this.productService.search(dto);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @Req() request: Request) {
    // Public route: the guard only populates request.user when a caller
    // identifies itself, so the seller still gets their owner-only fields.
    return this.productService.findOne(id, request.user?.id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') sellerId: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productService.update(id, sellerId, dto);
  }

  @Patch(':id/stock')
  updateStock(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') sellerId: string,
    @Body() dto: UpdateStockDto,
  ) {
    return this.productService.updateStock(id, sellerId, dto.stockQty);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') sellerId: string,
  ) {
    return this.productService.remove(id, sellerId);
  }
}

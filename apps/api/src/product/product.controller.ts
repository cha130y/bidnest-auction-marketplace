import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseFilePipeBuilder,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  UploadedFile,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { StorageService } from '../storage/storage.service';
import {
  MAX_PRODUCT_IMAGE_BYTES,
  PRODUCT_IMAGE_MIME_PATTERN
} from './constants/product-image.constant';
import { AddProductImageDto } from './dtos/add-product-image.dto';
import { CreateProductDto } from './dtos/create-product.dto';
import { SearchProductDto } from './dtos/search-product.dto';
import { UpdateProductDto } from './dtos/update-product.dto';
import { UpdateProductStatusDto } from './dtos/update-product-status.dto';
import { UpdateStockDto } from './dtos/update-stock.dto';
import { ProductService } from './product.service';

@Controller('products')
export class ProductController {
  constructor(
    private readonly productService: ProductService,
    private readonly storage: StorageService
  ) {}

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

  /**
   * PROD-002 — the seller's own listings, whatever state they are in.
   *
   * `GET /products` is the public catalogue and shows ACTIVE only, so a seller
   * cannot find the listing they paused or the one that sold out through it.
   *
   * Keep this above `GET :id`, or Nest matches the parameter route first and
   * ParseUUIDPipe rejects the word "mine" as a malformed id.
   */
  @Roles('USER')
  @Get('mine')
  listOwn(@CurrentUser('id') sellerId: string) {
    return this.productService.listOwnProducts(sellerId);
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
    @Body() dto: UpdateProductDto
  ) {
    return this.productService.update(id, sellerId, dto);
  }

  // PROD-002 — the seller's own pause switch, kept apart from PATCH :id so a
  // routine edit can never flip a listing off sale by accident
  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') sellerId: string,
    @Body() dto: UpdateProductStatusDto
  ) {
    return this.productService.updateStatus(id, sellerId, dto.status);
  }

  @Patch(':id/stock')
  updateStock(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') sellerId: string,
    @Body() dto: UpdateStockDto
  ) {
    return this.productService.updateStock(id, sellerId, dto.stockQty);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') sellerId: string
  ) {
    return this.productService.remove(id, sellerId);
  }

  /**
   * PROD-002 — adds a picture to a listing.
   *
   * The 503 is decided here, before multer reads anything: whether images can
   * be stored at all is known at startup, so a request that cannot succeed is
   * refused without a file crossing the wire. Cloudinary is optional in
   * `.env` precisely so the rest of the API boots without it.
   *
   * The file is validated for type and size twice over — once by multer's own
   * limit, once by the pipe — because the limit truncates and the pipe
   * explains.
   */
  @Roles('USER')
  @Post(':id/images')
  @UseInterceptors(
    FileInterceptor('image', { limits: { fileSize: MAX_PRODUCT_IMAGE_BYTES } })
  )
  addImage(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') sellerId: string,
    @Body() dto: AddProductImageDto,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({ fileType: PRODUCT_IMAGE_MIME_PATTERN })
        .addMaxSizeValidator({ maxSize: MAX_PRODUCT_IMAGE_BYTES })
        .build({ fileIsRequired: true })
    )
    image: Express.Multer.File
  ) {
    // Before the ownership check on purpose, and the order is worth stating:
    // 503 is a fact about this server, 404 is a fact about the request, and a
    // server that cannot store an image cannot serve any of these calls. It
    // also happens to leak less — every caller gets the same answer whatever
    // id they ask about, so the refusal reveals nothing about whose listing
    // it is. Once configured, the specific 404 comes back.
    if (!this.storage.isConfigured()) {
      throw new ServiceUnavailableException(
        'Image upload is not configured on this server'
      );
    }

    return this.productService.addImage(id, sellerId, image, dto.altText);
  }

  /** PROD-002 — removes a picture from a listing. */
  @Roles('USER')
  @Delete(':id/images/:imageId')
  removeImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @CurrentUser('id') sellerId: string
  ) {
    return this.productService.removeImage(id, sellerId, imageId);
  }
}

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { StoredImage } from '../storage/storage.service';
import { StorageService } from '../storage/storage.service';
import { MAX_PRODUCT_IMAGES } from './constants/product-image.constant';
import { ProductSort } from './constants/product-sort.constant';
import { CreateProductDto } from './dtos/create-product.dto';
import { SearchProductDto } from './dtos/search-product.dto';
import { UpdateProductDto } from './dtos/update-product.dto';
import { escapeLike } from './utils/escape-like.util';
import {
  productOwnerSelect,
  productPublicSelect,
  toOwnerProduct,
  toPublicProduct
} from './product.mapper';

const DEFAULT_PAGE_SIZE = 20;

@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService
  ) {}

  async create(sellerId: string, dto: CreateProductDto) {
    await this.assertCategoryIsActive(dto.categoryId);
    this.assertDiscountRuleIsComplete(dto);

    const images = await this.resolveImageKeys(sellerId, dto.imageUrls);

    const product = await this.prisma.product.create({
      data: {
        sellerId,
        categoryId: dto.categoryId,
        title: dto.title,
        description: dto.description,
        price: dto.price,
        stockQty: dto.stockQty,
        condition: dto.condition,
        status: dto.stockQty > 0 ? 'ACTIVE' : 'OUT_OF_STOCK',
        negotiationFloor: dto.negotiationFloor,
        quantityDiscountMinQty: dto.quantityDiscountMinQty,
        quantityDiscountPercent: dto.quantityDiscountPercent,
        images: { create: images }
      },
      select: productOwnerSelect
    });

    return {
      ...toOwnerProduct(product),
      warnings: this.buildFloorWarnings(dto)
    };
  }

  /**
   * PROD-001 — what to record as the storage key for each picture on a new
   * listing.
   *
   * A listing is created with its pictures already on it, so they arrive as
   * urls: uploaded to /uploads/images first, attached here second. Recording
   * an invented key for those loses the only handle on the file, and removing
   * the picture later then deletes the row while the file stays in the store
   * forever — the store reads a key it never issued as "already gone" and
   * reports success.
   *
   * So the real key is recovered from the url, but claimed only when all of
   * this holds:
   *
   * - the url is one we uploaded (anything else has no file of ours behind it);
   * - it sits in *this seller's* pending folder, so a url belonging to someone
   *   else cannot be attached to a listing and then deleted out from under them;
   * - no row holds that key yet, here or in the database — `storageKey` is
   *   unique, and the row that has it is the one entitled to delete the file.
   *
   * Everything else keeps the invented key it has always had. That is not a
   * fallback that loses anything: those pictures had no file of ours to delete
   * in the first place.
   */
  private async resolveImageKeys(sellerId: string, urls: string[]) {
    const prefix = this.storage.pendingPrefix(sellerId);

    const candidates = urls.map((url) => {
      const key = this.storage.storageKeyFromUrl(url);
      return key?.startsWith(prefix) ? key : null;
    });

    const claimable = candidates.filter((key): key is string => key !== null);

    const taken = new Set(
      claimable.length === 0
        ? []
        : (
            await this.prisma.productImage.findMany({
              where: { storageKey: { in: claimable } },
              select: { storageKey: true }
            })
          ).map((image) => image.storageKey)
    );

    return urls.map((url, index) => {
      const key = candidates[index];
      // Added as we go, so the same url twice in one request claims once.
      const claimed = key !== null && !taken.has(key);
      if (key !== null) taken.add(key);

      return {
        storageKey: claimed ? key : `${sellerId}/${randomUUID()}/${index}`,
        url,
        position: index,
        isPrimary: index === 0
      };
    });
  }

  async search(dto: SearchProductDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? DEFAULT_PAGE_SIZE;

    if (
      dto.minPrice !== undefined &&
      dto.maxPrice !== undefined &&
      dto.minPrice > dto.maxPrice
    ) {
      throw new BadRequestException('minPrice cannot be greater than maxPrice');
    }

    // PROD-003 — public catalog exposes ACTIVE listings only
    const where: Prisma.ProductWhereInput = {
      status: 'ACTIVE',
      ...(dto.categoryIds?.length
        ? { categoryId: { in: dto.categoryIds } }
        : {}),
      ...(dto.q
        ? {
            OR: [
              { title: { contains: escapeLike(dto.q), mode: 'insensitive' } },
              {
                description: {
                  contains: escapeLike(dto.q),
                  mode: 'insensitive'
                }
              }
            ]
          }
        : {}),
      ...(dto.minPrice !== undefined || dto.maxPrice !== undefined
        ? {
            price: {
              ...(dto.minPrice !== undefined ? { gte: dto.minPrice } : {}),
              ...(dto.maxPrice !== undefined ? { lte: dto.maxPrice } : {})
            }
          }
        : {})
    };

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        select: productPublicSelect,
        orderBy: this.buildOrderBy(dto.sort),
        skip: (page - 1) * limit,
        take: limit
      }),
      this.prisma.product.count({ where })
    ]);

    return {
      items: items.map(toPublicProduct),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
  }

  async findOne(id: string, requesterId?: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: productOwnerSelect
    });

    if (!product || product.status === 'REMOVED') {
      throw new NotFoundException('Product not found');
    }

    const isOwner = requesterId === product.sellerId;

    // PROD-002 / ADM-005 — listings that are off sale stay reachable for their
    // seller only, so a suspended seller still sees why their listing is down
    if (
      !isOwner &&
      (product.status === 'INACTIVE' || product.status === 'SUSPENDED')
    ) {
      throw new NotFoundException('Product not found');
    }

    return isOwner ? toOwnerProduct(product) : toPublicProduct(product);
  }

  async update(id: string, sellerId: string, dto: UpdateProductDto) {
    const existing = await this.findOwnedProduct(id, sellerId);

    this.assertNotSuspended(existing.status);

    if (existing.status === 'REMOVED') {
      throw new BadRequestException('Removed products cannot be edited');
    }

    if (dto.categoryId) await this.assertCategoryIsActive(dto.categoryId);

    const merged = {
      price: dto.price ?? Number(existing.price),
      negotiationFloor:
        dto.negotiationFloor ??
        (existing.negotiationFloor
          ? Number(existing.negotiationFloor)
          : undefined),
      quantityDiscountMinQty:
        dto.quantityDiscountMinQty ??
        existing.quantityDiscountMinQty ??
        undefined,
      quantityDiscountPercent:
        dto.quantityDiscountPercent ??
        (existing.quantityDiscountPercent
          ? Number(existing.quantityDiscountPercent)
          : undefined)
    };
    this.assertDiscountRuleIsComplete(merged);

    const nextStock = dto.stockQty ?? existing.stockQty;

    const product = await this.prisma.product.update({
      where: { id },
      data: {
        categoryId: dto.categoryId,
        title: dto.title,
        description: dto.description,
        price: dto.price,
        stockQty: dto.stockQty,
        condition: dto.condition,
        negotiationFloor: dto.negotiationFloor,
        quantityDiscountMinQty: dto.quantityDiscountMinQty,
        quantityDiscountPercent: dto.quantityDiscountPercent,
        status: this.resolveStatus(existing.status, nextStock)
      },
      select: productOwnerSelect
    });

    return {
      ...toOwnerProduct(product),
      warnings: this.buildFloorWarnings(merged)
    };
  }

  /**
   * PROD-002 — the seller pauses and resumes their own listing. Resuming honours
   * the current stock so a sold-out listing never comes back as purchasable
   * (PROD-005), and REMOVED stays terminal: pausing is what INACTIVE is for.
   */
  async updateStatus(
    id: string,
    sellerId: string,
    status: 'ACTIVE' | 'INACTIVE'
  ) {
    const existing = await this.findOwnedProduct(id, sellerId);

    this.assertNotSuspended(existing.status);

    if (existing.status === 'REMOVED') {
      throw new BadRequestException('Removed products cannot be restored');
    }

    const next =
      status === 'INACTIVE'
        ? 'INACTIVE'
        : existing.stockQty > 0
          ? 'ACTIVE'
          : 'OUT_OF_STOCK';

    const product = await this.prisma.product.update({
      where: { id },
      data: { status: next },
      select: productOwnerSelect
    });

    return toOwnerProduct(product);
  }

  async updateStock(id: string, sellerId: string, stockQty: number) {
    const existing = await this.findOwnedProduct(id, sellerId);

    this.assertNotSuspended(existing.status);

    if (existing.status === 'REMOVED') {
      throw new BadRequestException('Removed products cannot be restocked');
    }

    const product = await this.prisma.product.update({
      where: { id },
      data: { stockQty, status: this.resolveStatus(existing.status, stockQty) },
      select: productOwnerSelect
    });

    return toOwnerProduct(product);
  }

  async remove(id: string, sellerId: string) {
    const existing = await this.findOwnedProduct(id, sellerId);

    this.assertNotSuspended(existing.status);

    // PROD-002 — keep order history intact: a referenced product can only be
    // deactivated, never soft-deleted out of the catalog.
    const referencingOrders = await this.prisma.orderItem.count({
      where: { productId: id, order: { status: { not: 'CANCELLED' } } }
    });

    const status = referencingOrders > 0 ? 'INACTIVE' : 'REMOVED';
    await this.prisma.product.update({ where: { id }, data: { status } });

    return {
      id,
      status,
      message:
        referencingOrders > 0
          ? 'Product is referenced by existing orders and was deactivated instead of removed'
          : 'Product removed'
    };
  }

  /**
   * PROD-002 — every listing this seller has, whatever state it is in.
   *
   * Unpaginated on purpose: a seller manages their own shelf, and the count
   * is theirs rather than the catalogue's. If somebody turns up with hundreds,
   * this grows a page parameter — the screen does not need one to be written
   * first.
   *
   * REMOVED is left out. It is a soft delete kept so order history still
   * resolves, not a listing the seller can do anything with.
   */
  async listOwnProducts(sellerId: string) {
    const products = await this.prisma.product.findMany({
      where: { sellerId, status: { not: 'REMOVED' } },
      orderBy: { updatedAt: 'desc' },
      select: productOwnerSelect
    });

    return { items: products.map(toOwnerProduct) };
  }

  /**
   * PROD-002 — adds a picture to a listing the seller owns.
   *
   * The file goes to the store first and the row second, because a row
   * pointing at a file that was never stored is worse than a stored file with
   * no row: the first breaks every page that renders the listing, the second
   * costs a few kilobytes nobody sees. If the write then fails, the upload is
   * undone below.
   */
  async addImage(
    id: string,
    sellerId: string,
    file: { buffer: Buffer },
    altText?: string
  ) {
    const existing = await this.findOwnedProduct(id, sellerId);
    this.assertImagesAreEditable(existing.status);

    const imageCount = await this.prisma.productImage.count({
      where: { productId: id }
    });

    if (imageCount >= MAX_PRODUCT_IMAGES) {
      throw new BadRequestException(
        `A product can have at most ${MAX_PRODUCT_IMAGES} images`
      );
    }

    let stored: StoredImage;
    try {
      stored = await this.storage.uploadProductImage(file.buffer, id);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown';
      this.logger.error(`Image upload failed for product ${id}: ${message}`);
      throw new ServiceUnavailableException(
        'Image upload is temporarily unavailable'
      );
    }

    try {
      const product = await this.prisma.$transaction(async (tx) => {
        const current = await tx.product.findFirst({
          where: { id, sellerId },
          select: {
            _count: { select: { images: true } },
            images: {
              select: { position: true },
              orderBy: { position: 'desc' },
              take: 1
            }
          }
        });

        if (!current) throw new NotFoundException('Product not found');

        if (current._count.images >= MAX_PRODUCT_IMAGES) {
          throw new BadRequestException(
            `A product can have at most ${MAX_PRODUCT_IMAGES} images`
          );
        }

        // The next free slot, not the count: a removal leaves a gap, and
        // reusing it would collide with @@unique([productId, position]).
        const position = (current.images[0]?.position ?? -1) + 1;

        await tx.productImage.create({
          data: {
            productId: id,
            storageKey: stored.storageKey,
            url: stored.url,
            altText: altText ?? null,
            position,
            // The first picture on a listing with none is the one cards show.
            isPrimary: current._count.images === 0
          }
        });

        return tx.product.findUniqueOrThrow({
          where: { id },
          select: productOwnerSelect
        });
      });

      return toOwnerProduct(product);
    } catch (error: unknown) {
      try {
        await this.storage.deleteImage(stored.storageKey);
      } catch (cleanupError: unknown) {
        // Nothing left to tell the caller — they are getting the original
        // failure — so this is logged rather than thrown over the top of it.
        const message =
          cleanupError instanceof Error ? cleanupError.message : 'Unknown';
        this.logger.error(
          `Failed to remove orphaned image ${stored.storageKey}: ${message}`
        );
      }
      throw error;
    }
  }

  /**
   * PROD-002 — removes a picture from a listing the seller owns.
   *
   * Unlike an auction draft, a listing may not end up with none: PROD-001
   * requires at least one picture, and a listing is already on sale while this
   * is being called. Replacing the only picture means adding the new one
   * first.
   */
  async removeImage(id: string, sellerId: string, imageId: string) {
    const existing = await this.findOwnedProduct(id, sellerId);
    this.assertImagesAreEditable(existing.status);

    const { product, storageKey } = await this.prisma.$transaction(
      async (tx) => {
        const image = await tx.productImage.findFirst({
          where: { id: imageId, product: { id, sellerId } },
          select: { id: true, storageKey: true, isPrimary: true }
        });

        if (!image) throw new NotFoundException('Product image not found');

        const remaining = await tx.productImage.count({
          where: { productId: id }
        });

        if (remaining <= 1) {
          throw new BadRequestException(
            'A product must keep at least one image — add the replacement first'
          );
        }

        await tx.productImage.delete({ where: { id: image.id } });

        if (image.isPrimary) {
          const next = await tx.productImage.findFirst({
            where: { productId: id },
            orderBy: { position: 'asc' },
            select: { id: true }
          });

          if (next) {
            await tx.productImage.update({
              where: { id: next.id },
              data: { isPrimary: true }
            });
          }
        }

        const updated = await tx.product.findUniqueOrThrow({
          where: { id },
          select: productOwnerSelect
        });

        return { product: updated, storageKey: image.storageKey };
      }
    );

    try {
      // A picture added by URL has a storage key nothing was ever filed
      // under, and the store treats "not found" as done — so this is safe for
      // both kinds without having to tell them apart.
      await this.storage.deleteImage(storageKey);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown';
      this.logger.error(`Failed to delete image ${storageKey}: ${message}`);
    }

    return toOwnerProduct(product);
  }

  /**
   * PROD-002 — the same gate the rest of the edits use: an admin's suspension
   * is the admin's to lift, and a removed listing is not edited back to life.
   */
  private assertImagesAreEditable(currentStatus: string) {
    this.assertNotSuspended(currentStatus);

    if (currentStatus === 'REMOVED') {
      throw new BadRequestException('Removed products cannot be edited');
    }
  }

  private async findOwnedProduct(id: string, sellerId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: {
        id: true,
        sellerId: true,
        status: true,
        price: true,
        stockQty: true,
        negotiationFloor: true,
        quantityDiscountMinQty: true,
        quantityDiscountPercent: true
      }
    });

    if (!product) throw new NotFoundException('Product not found');
    if (product.sellerId !== sellerId) {
      throw new ForbiddenException('You do not own this product');
    }

    return product;
  }

  /**
   * PROD-002 / ADM-005 — an admin takedown is only enforceable if the seller
   * cannot walk out of it. Checking the *current* status (never the target one)
   * is what closes the loop: without it a seller soft-deletes to REMOVED first,
   * which wipes the evidence of the suspension, and rebuilds from there.
   */
  private assertNotSuspended(currentStatus: string) {
    if (currentStatus === 'SUSPENDED') {
      throw new ForbiddenException(
        'Product was suspended by an admin and can only be restored by an admin'
      );
    }
  }

  private async assertCategoryIsActive(categoryId: string) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { isActive: true }
    });

    if (!category) throw new BadRequestException('Category not found');
    if (!category.isActive) {
      throw new BadRequestException('Category is not active');
    }
  }

  private assertDiscountRuleIsComplete(input: {
    quantityDiscountMinQty?: number;
    quantityDiscountPercent?: number;
  }) {
    const hasMinQty = input.quantityDiscountMinQty !== undefined;
    const hasPercent = input.quantityDiscountPercent !== undefined;

    if (hasMinQty !== hasPercent) {
      throw new BadRequestException(
        'quantityDiscountMinQty and quantityDiscountPercent must be set together'
      );
    }
  }

  // PROD-007 — warn (never block) when the secret floor undercuts the promo price
  private buildFloorWarnings(input: {
    price?: number;
    negotiationFloor?: number;
    quantityDiscountPercent?: number;
  }): string[] {
    if (
      input.price === undefined ||
      input.negotiationFloor === undefined ||
      input.quantityDiscountPercent === undefined
    ) {
      return [];
    }

    const discountedUnitPrice =
      input.price * (1 - input.quantityDiscountPercent / 100);

    if (input.negotiationFloor >= discountedUnitPrice) return [];

    return [
      `negotiationFloor (${input.negotiationFloor}) is below the discounted unit price (${discountedUnitPrice.toFixed(2)}); negotiating buyers may pay less than buyers who qualify for the quantity discount`
    ];
  }

  private resolveStatus(
    currentStatus: string,
    stockQty: number
  ): 'ACTIVE' | 'OUT_OF_STOCK' | undefined {
    // PROD-005 — stock drives the ACTIVE/OUT_OF_STOCK flip; INACTIVE, REMOVED
    // and SUSPENDED are deliberate seller/admin states and must not be
    // overridden here, or a restock would quietly lift an admin takedown.
    if (currentStatus !== 'ACTIVE' && currentStatus !== 'OUT_OF_STOCK') {
      return undefined;
    }

    return stockQty > 0 ? 'ACTIVE' : 'OUT_OF_STOCK';
  }

  // `id` breaks ties so paging stays stable when prices or timestamps collide
  private buildOrderBy(
    sort?: ProductSort
  ): Prisma.ProductOrderByWithRelationInput[] {
    switch (sort) {
      case ProductSort.PRICE_ASC:
        return [{ price: 'asc' }, { id: 'asc' }];
      case ProductSort.PRICE_DESC:
        return [{ price: 'desc' }, { id: 'asc' }];
      default:
        return [{ createdAt: 'desc' }, { id: 'asc' }];
    }
  }
}

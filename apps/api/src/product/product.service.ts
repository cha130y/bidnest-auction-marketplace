import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProductSort } from './constants/product-sort.constant';
import { CreateProductDto } from './dtos/create-product.dto';
import { SearchProductDto } from './dtos/search-product.dto';
import { UpdateProductDto } from './dtos/update-product.dto';
import {
  productOwnerSelect,
  productPublicSelect,
  toOwnerProduct,
  toPublicProduct
} from './product.mapper';

const DEFAULT_PAGE_SIZE = 20;

@Injectable()
export class ProductService {
  constructor(private readonly prisma: PrismaService) {}

  async create(sellerId: string, dto: CreateProductDto) {
    await this.assertCategoryIsActive(dto.categoryId);
    this.assertDiscountRuleIsComplete(dto);

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
        images: {
          create: dto.imageUrls.map((url, index) => ({
            storageKey: `${sellerId}/${randomUUID()}/${index}`,
            url,
            position: index,
            isPrimary: index === 0
          }))
        }
      },
      select: productOwnerSelect
    });

    return {
      ...toOwnerProduct(product),
      warnings: this.buildFloorWarnings(dto)
    };
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
              { title: { contains: dto.q, mode: 'insensitive' } },
              { description: { contains: dto.q, mode: 'insensitive' } }
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
        status: this.resolveStatus(existing.status, nextStock),
        ...(dto.imageUrls
          ? {
              images: {
                deleteMany: {},
                create: dto.imageUrls.map((url, index) => ({
                  storageKey: `${sellerId}/${randomUUID()}/${index}`,
                  url,
                  position: index,
                  isPrimary: index === 0
                }))
              }
            }
          : {})
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

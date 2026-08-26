import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { ProductStatus } from '../../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

interface ListProductsQuery {
  cursor?: string;
  limit?: number;
  status?: ProductStatus;
}

/**
 * ADM-005 — Product listing oversight (owner: Dev 3)
 *
 * ปิด → `SUSPENDED` (ไม่ใช่ INACTIVE) เพราะ INACTIVE เป็นสถานะที่ผู้ขายเปิด
 * กลับเองได้ตาม PROD-002 ซึ่งจะทำให้ ADM-005 ไม่มีผลบังคับ — ดู ADR-0002
 * เปิดกลับ → `stockQty > 0 ? ACTIVE : OUT_OF_STOCK` (PROD-005)
 *
 * ทุกครั้งที่ปิด/เปิดต้องเขียน `admin_actions` ใน `$transaction` เดียวกับการ
 * อัปเดต `products.status` (ADM-004) พร้อมเหตุผลที่ admin ระบุ
 *
 * ห้ามแตะ orders ที่สถานะ PAID เด็ดขาด — ADM-005 ระบุว่าการปิดการขายปิดกั้น
 * เฉพาะคำสั่งซื้อใหม่ ฝั่ง buyer ถูกปิดกั้นด้วย allowlist `status === 'ACTIVE'`
 * ที่ ProductService.search, CartService.addItem และ CheckoutService อยู่แล้ว
 * ส่วนฝั่ง seller (แก้ไข/เติมสต็อก/soft-delete) กันไว้ที่
 * `ProductService.assertNotSuspended`
 */
@Injectable()
export class AdminProductsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The one stub this file shipped with — filled in by Dev 5, at Dev 5's own
   * request, since it was blocking a real GET /admin/products table on the
   * dashboard. Same cursor/limit/status shape ADM-002 and ADM-004 already
   * use, since it was scaffolded alongside those.
   */
  async listProducts(query: ListProductsQuery = {}) {
    const limit = query.limit ?? 20;

    const products = await this.prisma.product.findMany({
      where: query.status ? { status: query.status } : undefined,
      select: {
        id: true,
        title: true,
        status: true,
        stockQty: true,
        seller: {
          select: {
            id: true,
            email: true,
            profile: { select: { displayName: true } }
          }
        }
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: limit,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {})
    });

    return products.map(({ seller, ...product }) => ({
      ...product,
      seller: {
        id: seller.id,
        email: seller.email,
        displayName: seller.profile?.displayName ?? null
      }
    }));
  }

  /**
   * ADM-005 — takes an unsuitable listing off sale, or puts it back. Blocking
   * new orders only: orders already PAID keep their items and are never
   * cancelled here.
   */
  setProductActivation(
    productId: string,
    isActive: boolean,
    adminId: string,
    reason: string
  ) {
    return isActive
      ? this.reactivate(productId, adminId, reason)
      : this.deactivate(productId, adminId, reason);
  }

  private async deactivate(productId: string, adminId: string, reason: string) {
    const product = await this.findModerable(productId);

    if (product.status === 'SUSPENDED') {
      throw new BadRequestException('Product is already suspended');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id: productId },
        data: { status: 'SUSPENDED' },
        select: { id: true, title: true, status: true, stockQty: true }
      });

      await this.recordAction(
        tx,
        adminId,
        productId,
        'DEACTIVATE_PRODUCT',
        reason
      );

      return { ...updated, reason };
    });
  }

  private async reactivate(productId: string, adminId: string, reason: string) {
    const product = await this.findModerable(productId);

    // Only an admin takedown is an admin's to undo — a seller's own INACTIVE
    // listing stays the seller's to manage (PROD-002)
    if (product.status !== 'SUSPENDED') {
      throw new BadRequestException(
        `Only a suspended product can be reactivated (current: ${product.status})`
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id: productId },
        // A sold-out listing must not come back as purchasable (PROD-005)
        data: { status: product.stockQty > 0 ? 'ACTIVE' : 'OUT_OF_STOCK' },
        select: { id: true, title: true, status: true, stockQty: true }
      });

      await this.recordAction(
        tx,
        adminId,
        productId,
        'REACTIVATE_PRODUCT',
        reason
      );

      return { ...updated, reason };
    });
  }

  private async findModerable(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, status: true, stockQty: true }
    });

    if (!product) throw new NotFoundException('Product not found');

    // REMOVED is terminal in V1 — there is nothing left to moderate
    if (product.status === 'REMOVED') {
      throw new ForbiddenException(
        'Product was removed by its seller and cannot be moderated'
      );
    }

    return product;
  }

  /** ADM-004 — who did what, to which target, and why. */
  private recordAction(
    tx: Prisma.TransactionClient,
    adminUserId: string,
    productId: string,
    actionType: 'DEACTIVATE_PRODUCT' | 'REACTIVATE_PRODUCT',
    note: string
  ) {
    return tx.adminAction.create({
      data: { adminUserId, productId, actionType, note }
    });
  }
}

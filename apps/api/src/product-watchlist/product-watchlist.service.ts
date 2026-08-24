import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PUBLIC_PRODUCT_STATUSES } from '../product/constants/public-product-status.constant';
import {
  productPublicSelect,
  toPublicProduct
} from '../product/product.mapper';
import { PrismaService } from '../prisma/prisma.service';
import { ListProductWatchlistDto } from './dtos/list-product-watchlist.dto';

/** Matches the catalogue and the auction watchlist, so all three page alike. */
const DEFAULT_PAGE_SIZE = 20;

/**
 * Following a listing.
 *
 * Beyond the SRS — an addition the team agreed to, shaped after WAT-001/002 so
 * the two lists behave the same way from the outside even though they are
 * separate tables underneath.
 */
@Injectable()
export class ProductWatchlistService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Puts one listing on the caller's list.
   *
   * Idempotent — following something twice leaves one row and answers the same
   * way, so a double tap on a slow connection is not an error.
   */
  async watch(productId: string, userId: string) {
    await this.assertProductIsPublic(productId);

    const entry = await this.prisma.productWatchlist.upsert({
      where: { userId_productId: { userId, productId } },
      create: { userId, productId },
      // Nothing to change: the row exists or it does not. `createdAt` keeps the
      // first time they added it, so the list order does not jump around when
      // somebody taps twice.
      update: {},
      select: { createdAt: true }
    });

    return { productId, watching: true, watchedAt: entry.createdAt };
  }

  /**
   * Takes one listing off the list.
   *
   * Removing something that was never there is not an error — the caller
   * wanted it gone, and it is gone.
   */
  async unwatch(productId: string, userId: string) {
    const { count } = await this.prisma.productWatchlist.deleteMany({
      where: { userId, productId }
    });

    return { productId, watching: false, removed: count === 1 };
  }

  /**
   * The caller's followed listings, most recently followed first.
   *
   * Scoped by userId in the query rather than filtered afterwards, so there is
   * no path where somebody else's list could come back.
   */
  async listOwn(userId: string, dto: ListProductWatchlistDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? DEFAULT_PAGE_SIZE;

    // A listing the seller has since paused, or an admin has taken down, drops
    // out of the list rather than appearing as a row nobody may open.
    const where = {
      userId,
      product: { status: { in: PUBLIC_PRODUCT_STATUSES } }
    } satisfies Prisma.ProductWatchlistWhereInput;

    const [entries, total] = await Promise.all([
      this.prisma.productWatchlist.findMany({
        where,
        // The product id breaks ties so paging stays stable when two rows
        // share a timestamp.
        orderBy: [{ createdAt: 'desc' }, { productId: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          createdAt: true,
          product: { select: productPublicSelect }
        }
      }),
      this.prisma.productWatchlist.count({ where })
    ]);

    return {
      items: entries.map((entry) => ({
        watchedAt: entry.createdAt,
        // The public shape even when the viewer is the seller: this is the
        // buyer's list, and `negotiationFloor` has no business in it (PROD-006).
        product: toPublicProduct(entry.product)
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
  }

  /**
   * Only a listing a buyer may see can be followed, so this cannot become a
   * way to confirm that a paused or suspended one exists: it answers exactly
   * as an id that was never a product.
   */
  private async assertProductIsPublic(productId: string): Promise<void> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, status: { in: PUBLIC_PRODUCT_STATUSES } },
      select: { id: true }
    });

    if (!product) throw new NotFoundException('Product not found');
  }
}

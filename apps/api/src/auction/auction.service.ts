import {
  BadRequestException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  auctionRowSelect,
  auctionPublishGateSelect,
  toOwnerAuction
} from './auction.mapper';
import { CreateAuctionDraftDto } from './dtos/create-auction-draft.dto';
import { validateDraftForPublish } from './utils/validate-draft-for-publish.util';

@Injectable()
export class AuctionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * AUC-001 — a draft is private to its seller and lands in DRAFT, the only
   * status the lifecycle lets a seller create directly (SRS 4.2).
   */
  async createDraft(sellerId: string, dto: CreateAuctionDraftDto) {
    await this.assertCategoryIsActive(dto.categoryId);

    const auction = await this.prisma.auction.create({
      data: {
        sellerId,
        categoryId: dto.categoryId,
        title: dto.title,
        description: dto.description,
        condition: dto.condition,
        status: 'DRAFT',
        startingPrice: dto.startingPrice,
        minBidIncrement: dto.minBidIncrement,
        reservePrice: dto.reservePrice,
        scheduledStartAt: dto.scheduledStartAt,
        // originalEndAt holds the end time before any anti-sniping extension
        // (BID-004), so both columns start out as the drafted end time.
        originalEndAt: dto.scheduledEndAt,
        currentEndAt: dto.scheduledEndAt,
        images: {
          create: (dto.imageUrls ?? []).map((url, index) => ({
            storageKey: `${sellerId}/${randomUUID()}/${index}`,
            url,
            position: index,
            isPrimary: index === 0
          }))
        },
        events: { create: { eventType: 'CREATED', actorUserId: sellerId } }
      },
      select: auctionRowSelect
    });

    return toOwnerAuction(auction);
  }

  async listOwnDrafts(sellerId: string) {
    const drafts = await this.prisma.auction.findMany({
      where: { sellerId, status: 'DRAFT', deletedAt: null },
      select: auctionRowSelect,
      // `id` breaks ties so paging stays stable when timestamps collide
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }]
    });

    return { items: drafts.map(toOwnerAuction) };
  }

  /**
   * AUC-001 — scoping the lookup by sellerId (rather than checking ownership
   * afterwards) is what keeps a draft private: a stranger gets the same 404 as
   * for an id that does not exist, so the response never confirms it is there.
   */
  async findOwnDraft(id: string, sellerId: string) {
    const auction = await this.prisma.auction.findFirst({
      where: { id, sellerId, status: 'DRAFT', deletedAt: null },
      select: auctionRowSelect
    });

    if (!auction) throw new NotFoundException('Auction draft not found');

    return toOwnerAuction(auction);
  }

  /**
   * AUC-002 — the pre-publish check. It reports what the draft is still missing
   * instead of throwing, so the seller can see and fix everything at once; the
   * same rules become the hard gate when AUC-004 publishes.
   *
   * Scoped by sellerId for the same reason findOwnDraft is: the checklist would
   * otherwise tell a stranger what a private draft does and does not contain.
   */
  async validateOwnDraft(id: string, sellerId: string) {
    const draft = await this.prisma.auction.findFirst({
      where: { id, sellerId, status: 'DRAFT', deletedAt: null },
      select: auctionPublishGateSelect
    });

    if (!draft) throw new NotFoundException('Auction draft not found');

    const issues = validateDraftForPublish(draft);

    return { auctionId: draft.id, ready: issues.length === 0, issues };
  }

  // ADR-0001 — auctions and products draw from the same category set, so an
  // auction may only reference a category an admin has left active.
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
}

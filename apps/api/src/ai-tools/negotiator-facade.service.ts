import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '../../generated/prisma/client';
import { AIRequestType, OfferDecision } from '../../generated/prisma/enums';
import { EnvVariable } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { NegotiatorService } from './negotiator.service';

const COOLDOWN_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS_PER_WINDOW = 3;
const ATTEMPT_WINDOW_MS = 24 * 60 * 60 * 1000;
const ACCEPT_TOKEN_TTL = '15m';

export interface AcceptTokenPayload {
  offerId: string;
  productId: string;
  buyerId: string;
}

/**
 * AI-003 — AI Negotiator facade (Optional, owner: Dev 5)
 *
 * 🔌 Integration point for Dev 3 (CART-004/checkout): call
 * `verifyAndConsumeAcceptToken(token)` before creating an order from an
 * accepted offer. It throws if the token is invalid, expired, or already
 * consumed. There is no `consumedAt` column on `Offer` — schema changes need
 * asking first per CLAUDE.md — so "consumed" is represented by moving
 * `expiresAt` into the past, guarded by an `updateMany` that only succeeds if
 * `expiresAt` is still in the future. That makes consuming a token atomic and
 * safe against two concurrent checkouts racing on the same accepted offer.
 */
@Injectable()
export class NegotiatorFacadeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly negotiator: NegotiatorService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<EnvVariable, true>
  ) {}

  async negotiate(
    productId: string,
    buyerId: string,
    quantity: number,
    offerAmount: number
  ) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        sellerId: true,
        status: true,
        price: true,
        stockQty: true,
        negotiationFloor: true
      }
    });

    if (!product || product.status !== 'ACTIVE') {
      throw new NotFoundException('Product not found');
    }
    if (product.sellerId === buyerId) {
      throw new ForbiddenException('You cannot negotiate on your own listing');
    }
    if (product.negotiationFloor === null) {
      throw new BadRequestException('This listing does not accept offers');
    }

    const recentOffers = await this.readRecentOffers(buyerId, productId);
    const outstandingCounter =
      NegotiatorFacadeService.findOutstandingCounter(recentOffers);
    const isMeetingCounter =
      outstandingCounter !== null && offerAmount >= outstandingCounter;

    // Meeting the price this negotiation itself proposed is an acceptance
    // rather than another probe at the secret floor: the amount came from the
    // server, so sending it back reveals nothing about the floor and cannot be
    // used to search for it. Charged against the cooldown, a buyer ready to
    // agree would have to wait five minutes to say so — and one whose third
    // attempt produced the counter could never say so at all, because the
    // daily cap would already be spent on the negotiation that reached it.
    if (!isMeetingCounter) {
      this.assertWithinRateLimit(recentOffers);
    }

    const result = this.negotiator.decide(
      offerAmount,
      product.negotiationFloor.toNumber(),
      product.price.toNumber(),
      quantity,
      product.stockQty,
      outstandingCounter
    );

    const expiresAt =
      result.decision === 'ACCEPTED'
        ? new Date(Date.now() + 15 * 60 * 1000)
        : null;

    const offer = await this.prisma.$transaction(async (tx) => {
      const created = await tx.offer.create({
        data: {
          buyerId,
          productId,
          quantity,
          offerAmount,
          decision: result.decision,
          counterAmount: result.counterAmount,
          expiresAt
        }
      });

      await tx.aIRequest.create({
        data: { userId: buyerId, type: AIRequestType.NEGOTIATION }
      });

      return created;
    });

    const acceptToken =
      result.decision === 'ACCEPTED'
        ? await this.signAcceptToken({ offerId: offer.id, productId, buyerId })
        : null;

    return {
      id: offer.id,
      decision: offer.decision,
      counterAmount: result.counterAmount,
      expiresAt: offer.expiresAt,
      acceptToken
    };
  }

  /**
   * AI-003 — the agreed prices this buyer can still pay for.
   *
   * The counterpart to `GET /auctions/won`, and it exists for the same reason:
   * an accepted offer only ever led to checkout through the button on the card
   * that announced it, so navigating away — or closing the tab — left the offer
   * alive in the database with nothing anywhere leading back to it. Fifteen
   * minutes is short enough that "negotiate it again" is not an answer, and the
   * cooldown means it often is not even possible.
   *
   * `expiresAt > now` is the whole filter, and it is exact: consuming a token
   * moves `expiresAt` into the past (see `verifyAndConsumeAcceptToken`), so one
   * comparison excludes the expired and the already-paid alike. Listings that
   * are no longer on sale drop out too — that offer cannot be paid whatever the
   * clock says.
   *
   * Each row carries a freshly signed token rather than the original, which was
   * never stored. That is safe because the token has never been the thing that
   * decides: the offer row's own `expiresAt` is, and it is checked again, under
   * a conditional update, at the moment of redemption.
   */
  async listPayableOffers(buyerId: string) {
    const offers = await this.prisma.offer.findMany({
      where: {
        buyerId,
        decision: 'ACCEPTED',
        expiresAt: { gt: new Date() },
        product: { status: 'ACTIVE' }
      },
      select: {
        id: true,
        quantity: true,
        offerAmount: true,
        expiresAt: true,
        product: {
          select: {
            id: true,
            title: true,
            stockQty: true,
            images: {
              select: { url: true },
              where: { isPrimary: true },
              take: 1
            }
          }
        }
      },
      // Soonest to lapse first: the one most in danger of being lost is the one
      // worth showing at the top.
      orderBy: { expiresAt: 'asc' }
    });

    const items = await Promise.all(
      offers.map(async (offer) => ({
        offerId: offer.id,
        quantity: offer.quantity,
        unitPrice: offer.offerAmount.toFixed(2),
        total: offer.offerAmount.mul(offer.quantity).toFixed(2),
        expiresAt: offer.expiresAt,
        // Said out loud so a screen can warn before the buyer fills in an
        // address for something checkout is about to refuse.
        inStock: offer.product.stockQty >= offer.quantity,
        product: {
          id: offer.product.id,
          title: offer.product.title,
          imageUrl: offer.product.images[0]?.url ?? null
        },
        acceptToken: await this.signAcceptToken({
          offerId: offer.id,
          productId: offer.product.id,
          buyerId
        })
      }))
    );

    return { items };
  }

  /** 🔌 Dev 3 calls this from checkout before turning an accepted offer into an order. */
  async verifyAndConsumeAcceptToken(
    token: string
  ): Promise<AcceptTokenPayload> {
    let payload: AcceptTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AcceptTokenPayload>(token, {
        secret: this.config.get('AI_NEGOTIATOR_JWT_SECRET', { infer: true })
      });
    } catch {
      throw new BadRequestException('Offer token is invalid or expired');
    }

    // Only succeeds if expiresAt is still in the future — the guard doubles
    // as both "not expired" and "not already consumed by another checkout".
    const { count } = await this.prisma.offer.updateMany({
      where: {
        id: payload.offerId,
        decision: 'ACCEPTED',
        expiresAt: { gt: new Date() }
      },
      data: { expiresAt: new Date(0) }
    });

    if (count !== 1) {
      throw new BadRequestException(
        'Offer has already been used or has expired'
      );
    }

    return payload;
  }

  /**
   * This buyer's offers on this listing inside the attempt window, newest
   * first.
   *
   * One read serves both the rate limit and the outstanding counter, and the
   * window bounds how old a counter may be when it is met: a proposal from
   * yesterday is not one the seller is still standing behind, and PROD-002
   * lets them move the price or the floor in between. The floor is re-checked
   * against the listing as it is now regardless, so an old counter can never
   * carry a price below the current floor.
   */
  private readRecentOffers(buyerId: string, productId: string) {
    return this.prisma.offer.findMany({
      where: {
        buyerId,
        productId,
        createdAt: { gt: new Date(Date.now() - ATTEMPT_WINDOW_MS) }
      },
      select: { createdAt: true, decision: true, counterAmount: true },
      orderBy: { createdAt: 'desc' }
    });
  }

  private assertWithinRateLimit(recentOffers: { createdAt: Date }[]): void {
    if (recentOffers.length > 0) {
      const sinceLastOffer = Date.now() - recentOffers[0].createdAt.getTime();
      if (sinceLastOffer < COOLDOWN_MS) {
        const waitSeconds = Math.ceil((COOLDOWN_MS - sinceLastOffer) / 1000);
        throw new BadRequestException(
          `Please wait ${waitSeconds}s before making another offer on this item`
        );
      }
    }

    if (recentOffers.length >= MAX_ATTEMPTS_PER_WINDOW) {
      throw new BadRequestException(
        'You have reached the maximum number of offers for this item today'
      );
    }
  }

  /**
   * The counter still on the table, if there is one.
   *
   * Read from the newest countered offer rather than the newest offer of any
   * kind: an offer below the floor is refused outright and leaves no counter
   * behind, and it should not withdraw the one the buyer was already holding.
   */
  private static findOutstandingCounter(
    recentOffers: {
      decision: OfferDecision;
      counterAmount: Prisma.Decimal | null;
    }[]
  ): number | null {
    const countered = recentOffers.find(
      (offer) => offer.decision === 'COUNTERED' && offer.counterAmount !== null
    );

    return countered?.counterAmount?.toNumber() ?? null;
  }

  private signAcceptToken(payload: AcceptTokenPayload): Promise<string> {
    return this.jwt.signAsync(payload, {
      secret: this.config.get('AI_NEGOTIATOR_JWT_SECRET', { infer: true }),
      expiresIn: ACCEPT_TOKEN_TTL
    });
  }
}

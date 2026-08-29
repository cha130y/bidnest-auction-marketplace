import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AIRequestType } from '../../generated/prisma/enums';
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

    await this.assertWithinRateLimit(buyerId, productId);

    const result = this.negotiator.decide(
      offerAmount,
      product.negotiationFloor.toNumber(),
      product.price.toNumber(),
      quantity,
      product.stockQty
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

  private async assertWithinRateLimit(
    buyerId: string,
    productId: string
  ): Promise<void> {
    const recentOffers = await this.prisma.offer.findMany({
      where: {
        buyerId,
        productId,
        createdAt: { gt: new Date(Date.now() - ATTEMPT_WINDOW_MS) }
      },
      select: { createdAt: true },
      orderBy: { createdAt: 'desc' }
    });

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

  private signAcceptToken(payload: AcceptTokenPayload): Promise<string> {
    return this.jwt.signAsync(payload, {
      secret: this.config.get('AI_NEGOTIATOR_JWT_SECRET', { infer: true }),
      expiresIn: ACCEPT_TOKEN_TTL
    });
  }
}

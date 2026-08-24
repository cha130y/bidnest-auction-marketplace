import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import {
  SchemaType,
  type Part,
  type ResponseSchema
} from '@google/generative-ai';
import { z } from 'zod';
import { AIRequestType } from '../../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiClientService } from './gemini-client.service';

/** AI-002 — send at most this many photos: keeps the request small and the
 * cost predictable, and a listing's first few photos are the ones a buyer
 * (and therefore the model) would judge condition/value from anyway. */
const MAX_IMAGES = 3;

const ESTIMABLE_STATUSES = ['DRAFT', 'SCHEDULED'] as const;

const responseSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    suggestedStartingPrice: { type: SchemaType.NUMBER },
    estimatedClosingRangeLow: { type: SchemaType.NUMBER },
    estimatedClosingRangeHigh: { type: SchemaType.NUMBER },
    reason: { type: SchemaType.STRING }
  },
  required: [
    'suggestedStartingPrice',
    'estimatedClosingRangeLow',
    'estimatedClosingRangeHigh',
    'reason'
  ]
};

const estimateSchema = z.object({
  suggestedStartingPrice: z.number().positive(),
  estimatedClosingRangeLow: z.number().positive(),
  estimatedClosingRangeHigh: z.number().positive(),
  reason: z.string().min(1)
});

export type PriceEstimate = z.infer<typeof estimateSchema>;

/**
 * AI-002 — AI Price Estimator (Optional, owner: Dev 5)
 *
 * "แต่ละ draft ประเมินได้จำนวนคงที่ที่น้อย" ตาม SRS — แต่ `ai_requests` (ตาราง
 * เดียวที่มีสำหรับ log ฟีเจอร์ AI ตัวนี้) มีแค่ userId/type/createdAt ไม่มี
 * auctionId ให้ผูก จะเพิ่ม column ต้องแก้ schema ซึ่ง CLAUDE.md ห้ามทำโดยไม่ถาม
 * ก่อน — ใช้ @Throttle ที่ตัว controller แทน (per-user ต่อช่วงเวลา ไม่ใช่
 * per-draft เป๊ะๆ ตามตัวหนังสือ SRS แต่ได้ผลลัพธ์เดียวกันคือคุมต้นทุน/กันสแปม)
 * ถ้าอยากได้ cap แบบ per-draft จริงต้องคุยเรื่อง schema ก่อน
 */
@Injectable()
export class PriceEstimatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiClientService
  ) {}

  async estimate(auctionId: string, sellerId: string): Promise<PriceEstimate> {
    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
      select: {
        id: true,
        sellerId: true,
        status: true,
        condition: true,
        category: { select: { name: true } },
        images: {
          select: { url: true },
          orderBy: { position: 'asc' },
          take: MAX_IMAGES
        }
      }
    });

    if (!auction || auction.status === 'CANCELLED') {
      throw new NotFoundException('Auction not found');
    }
    if (auction.sellerId !== sellerId) {
      throw new ForbiddenException('Not your draft');
    }
    if (!ESTIMABLE_STATUSES.includes(auction.status as 'DRAFT' | 'SCHEDULED')) {
      throw new BadRequestException(
        `Cannot estimate a price for an auction that is ${auction.status}`
      );
    }
    if (auction.images.length === 0) {
      throw new BadRequestException(
        'Upload at least one photo before asking for a price estimate'
      );
    }

    const imageParts = await Promise.all(
      auction.images.map((image) => this.fetchImagePart(image.url))
    );

    const prompt = this.buildPrompt(auction.category.name, auction.condition);
    const parts: Part[] = [{ text: prompt }, ...imageParts];

    const raw = await this.gemini.generateVisionJson(parts, responseSchema);
    const parsed = this.parseEstimate(raw);

    await this.prisma.aIRequest.create({
      data: { userId: sellerId, type: AIRequestType.PRICE_ESTIMATE }
    });

    return parsed;
  }

  private buildPrompt(categoryName: string, condition: string): string {
    return [
      'คุณคือผู้ช่วยประเมินราคาสินค้าประมูลของ BidNest',
      `หมวดหมู่: ${categoryName}`,
      `สภาพสินค้าที่ผู้ขายระบุ: ${condition}`,
      'ดูรูปสินค้าที่แนบมาแล้วประเมิน:',
      '1. suggestedStartingPrice — ราคาเริ่มต้นประมูลที่แนะนำ (บาท)',
      '2. estimatedClosingRangeLow/estimatedClosingRangeHigh — ช่วงราคาปิดประมูลโดยประมาณ',
      '3. reason — เหตุผลสั้นๆ ว่าทำไมถึงประเมินราคานี้ (อ้างอิงจากสภาพ/หมวดหมู่ที่เห็นในรูป)',
      'นี่เป็นแค่คำแนะนำ ไม่ใช่การตีราคาหรือการรับประกันใดๆ ตอบเป็น JSON ตาม schema ที่กำหนดเท่านั้น'
    ].join('\n');
  }

  private parseEstimate(raw: string): PriceEstimate {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new BadRequestException(
        'AI ไม่สามารถประเมินราคาได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง'
      );
    }

    const result = estimateSchema.safeParse(json);
    if (!result.success) {
      throw new BadRequestException(
        'AI ไม่สามารถประเมินราคาได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง'
      );
    }

    return result.data;
  }

  private async fetchImagePart(url: string): Promise<Part> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new BadRequestException('Could not read one of the listing photos');
    }

    const mimeType = response.headers.get('content-type') ?? 'image/jpeg';
    const buffer = Buffer.from(await response.arrayBuffer());

    return {
      inlineData: { mimeType, data: buffer.toString('base64') }
    };
  }
}

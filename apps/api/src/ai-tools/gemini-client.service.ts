import { Injectable, Logger } from '@nestjs/common';
import {
  GoogleGenerativeAI,
  Part,
  ResponseSchema
} from '@google/generative-ai';
import { ConfigService } from '@nestjs/config';
import { EnvVariable } from '../config/env.validation';
import { GeminiUnavailableException } from './exceptions/gemini-unavailable.exception';

const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 1_000;

@Injectable()
export class GeminiClientService {
  private readonly logger = new Logger(GeminiClientService.name);
  private readonly client: GoogleGenerativeAI | null;
  private readonly modelName = 'gemini-flash-lite-latest';

  constructor(config: ConfigService<EnvVariable, true>) {
    const apiKey = config.get('GEMINI_API_KEY', { infer: true });

    if (!apiKey) {
      // Said once at startup rather than on every chat message, so a
      // teammate without a Gemini key finds out before they try AI-001,
      // same pattern as StorageService for Cloudinary.
      this.logger.log(
        'GEMINI_API_KEY is not set; support chat will answer 503'
      );
      this.client = null;
      return;
    }

    this.client = new GoogleGenerativeAI(apiKey);
  }

  /** Whether a reply is possible at all — checked before Gemini is ever called. */
  isConfigured(): boolean {
    return this.client !== null;
  }

  /**
   * AI-001 — a low, fixed temperature rather than the model's default
   * (~1.0): this is a lookup against a fixed FAQ, not creative writing, and
   * at the default temperature the model would sometimes claim an exact FAQ
   * match "isn't covered" (or the reverse — answer confidently off the FAQ)
   * on nothing but sampling luck. Found live: the same question, sent
   * unchanged, answered correctly about half the time before this.
   */
  generateReply(prompt: string, timeoutMs = 15_000): Promise<string> {
    return this.runWithRetry(
      (model) =>
        model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2 }
        }),
      timeoutMs
    );
  }

  /**
   * AI-002 — multimodal request (text + product photos) that asks Gemini to
   * answer as JSON matching `schema`, so the caller parses a fixed shape
   * instead of scraping free text out of a chat-style reply.
   */
  generateVisionJson(
    parts: Part[],
    schema: ResponseSchema,
    timeoutMs = 20_000
  ): Promise<string> {
    return this.runWithRetry(
      (model) =>
        model.generateContent({
          contents: [{ role: 'user', parts }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: schema
          }
        }),
      timeoutMs
    );
  }

  private async runWithRetry(
    call: (
      model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>
    ) => ReturnType<
      ReturnType<GoogleGenerativeAI['getGenerativeModel']>['generateContent']
    >,
    timeoutMs: number
  ): Promise<string> {
    if (!this.client) {
      throw new GeminiUnavailableException();
    }

    const model = this.client.getGenerativeModel({ model: this.modelName });

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('GEMINI_TIMEOUT')), timeoutMs);
      });

      try {
        const result = await Promise.race([call(model), timeoutPromise]);
        return result.response.text();
      } catch (error) {
        const isLastAttempt = attempt === MAX_RETRIES;

        if (!this.isRetryable(error as Error) || isLastAttempt) {
          this.logger.warn(
            `Gemini request failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}): ${(error as Error).message}`
          );
          throw new GeminiUnavailableException(error);
        }

        const delay = RETRY_BASE_DELAY_MS * 2 ** attempt;
        this.logger.warn(
          `Gemini request failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${delay}ms: ${(error as Error).message}`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // ไม่มีทางมาถึงบรรทัดนี้ได้จริง (loop ด้านบน throw หรือ return เสมอ) — TypeScript ต้องการ return/throw ปิดท้ายฟังก์ชัน
    throw new GeminiUnavailableException();
  }

  /** retry เฉพาะปัญหาชั่วคราวฝั่ง Gemini (5xx เช่น 503 high demand) หรือ timeout ของเราเอง — ไม่ retry 4xx (API key ผิด, โมเดลไม่มีจริง ฯลฯ) เพราะลองใหม่ก็ไม่ช่วย */
  private isRetryable(error: Error): boolean {
    if (error.message === 'GEMINI_TIMEOUT') {
      return true;
    }

    const statusMatch = error.message.match(/\[(\d{3})/);
    if (!statusMatch) {
      return false;
    }

    const status = Number(statusMatch[1]);
    return status >= 500 && status < 600;
  }
}

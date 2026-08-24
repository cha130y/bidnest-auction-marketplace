import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
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
      this.logger.log('GEMINI_API_KEY is not set; support chat will answer 503');
      this.client = null;
      return;
    }

    this.client = new GoogleGenerativeAI(apiKey);
  }

  /** Whether a reply is possible at all — checked before Gemini is ever called. */
  isConfigured(): boolean {
    return this.client !== null;
  }

  async generateReply(prompt: string, timeoutMs = 15_000): Promise<string> {
    if (!this.client) {
      throw new GeminiUnavailableException();
    }

    const model = this.client.getGenerativeModel({ model: this.modelName });

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('GEMINI_TIMEOUT')), timeoutMs);
      });

      try {
        const result = await Promise.race([
          model.generateContent(prompt),
          timeoutPromise
        ]);
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

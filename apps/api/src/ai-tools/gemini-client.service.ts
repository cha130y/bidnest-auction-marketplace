import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ConfigService } from '@nestjs/config';
import { GeminiUnavailableException } from './exceptions/gemini-unavailable.exception';

@Injectable()
export class GeminiClientService {
  private readonly logger = new Logger(GeminiClientService.name);
  private readonly client: GoogleGenerativeAI;
  private readonly modelName = 'gemini-1.5-flash';

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.getOrThrow<string>('GEMINI_API_KEY');
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async generateReply(prompt: string, timeoutMs = 15_000): Promise<string> {
    const model = this.client.getGenerativeModel({ model: this.modelName });

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
      this.logger.warn(`Gemini request failed: ${(error as Error).message}`);
      throw new GeminiUnavailableException(error);
    }
  }
}

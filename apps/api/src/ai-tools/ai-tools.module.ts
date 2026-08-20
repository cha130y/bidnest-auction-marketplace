import { Module } from '@nestjs/common';
import { GeminiClientService } from './gemini-client.service';
import { PromptBuilderService } from './prompt-builder.service';

@Module({
  providers: [GeminiClientService, PromptBuilderService],
  exports: [GeminiClientService, PromptBuilderService]
})
export class AiToolsModule {}

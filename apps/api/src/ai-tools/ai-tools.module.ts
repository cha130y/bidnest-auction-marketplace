import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { GeminiClientService } from './gemini-client.service';
import { PromptBuilderService } from './prompt-builder.service';
import { PriceEstimateController } from './price-estimate.controller';
import { PriceEstimatorService } from './price-estimator.service';
import { OffersController } from './offers.controller';
import { NegotiatorService } from './negotiator.service';
import { NegotiatorFacadeService } from './negotiator-facade.service';

// AI-003 signs/verifies its own accept token with AI_NEGOTIATOR_JWT_SECRET —
// AppModule's JwtModule.register({}) is not global (see auth.module.ts,
// which registers its own for the same reason), so this module needs its own
// import to get a JwtService instance.
@Module({
  imports: [JwtModule.register({})],
  controllers: [PriceEstimateController, OffersController],
  providers: [
    GeminiClientService,
    PromptBuilderService,
    PriceEstimatorService,
    NegotiatorService,
    NegotiatorFacadeService
  ],
  exports: [GeminiClientService, PromptBuilderService, NegotiatorFacadeService]
})
export class AiToolsModule {}

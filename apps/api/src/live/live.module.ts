import { Module } from '@nestjs/common';
import { AuctionModule } from '../auction/auction.module';
import { LiveService } from './live.service';
import { LobbyController } from './lobby.controller';
import { ParticipantController } from './participant.controller';

/**
 * LIV-001..005 — the Live Arena: the lobby before an auction starts, and the
 * arena while it runs.
 *
 * Separate from AuctionModule on purpose. An auction's lifecycle and what a
 * screen shows of it while people watch are different concerns, and the
 * auction service is already the largest file in the module.
 *
 * AuctionModule is imported for AuctionService, so the lobby reads an auction
 * through exactly the same code path the REST route does.
 */
@Module({
  imports: [AuctionModule],
  controllers: [LobbyController, ParticipantController],
  providers: [LiveService],
  exports: [LiveService]
})
export class LiveModule {}

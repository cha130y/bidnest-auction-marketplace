import { Module } from '@nestjs/common';
import { AuctionLifecycleService } from './auction-lifecycle.service';
import { AuctionController } from './auction.controller';
import { AuctionService } from './auction.service';

@Module({
  controllers: [AuctionController],
  providers: [AuctionService, AuctionLifecycleService],
  exports: [AuctionService]
})
export class AuctionModule {}

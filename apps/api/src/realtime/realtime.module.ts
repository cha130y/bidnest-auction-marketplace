import { Global, Module } from '@nestjs/common';
import { AuctionGateway } from './auction.gateway';
import { RealtimeService } from './realtime.service';

@Global()
@Module({
  providers: [RealtimeService, AuctionGateway],
  exports: [RealtimeService, AuctionGateway]
})
export class RealtimeModule {}

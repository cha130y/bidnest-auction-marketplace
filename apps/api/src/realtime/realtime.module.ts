import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuctionGateway } from './auction.gateway';
import { RealtimeService } from './realtime.service';
import { UserGateway } from './user.gateway';

/**
 * SRS 4.1 — the two realtime channels: a room per auction, public to anyone
 * watching, and a room per person for everything addressed at them.
 *
 * Global because half the modules in the project push something.
 *
 * JwtModule is imported rather than assumed: AppModule registers it too, but
 * `JwtModule.register()` is not global, so a module that verifies a token has
 * to ask for it itself. Registered empty for the same reason AppModule does —
 * secrets are passed per verify call, never baked in here.
 */
@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [RealtimeService, AuctionGateway, UserGateway],
  exports: [RealtimeService, AuctionGateway, UserGateway]
})
export class RealtimeModule {}

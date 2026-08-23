import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuctionGateway } from './auction.gateway';
import { PresenceRegistry } from './presence-registry';
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
  /**
   * Note what is *not* imported here: nothing from a feature module.
   *
   * LIV-001 needs a dropped socket to mark its person absent, which is a
   * decision only LiveService can make — but LiveService already announces
   * through AuctionGateway, and AuctionService depends on that gateway too.
   * Importing back would close a loop and spread it.
   *
   * So the gateway offers a place to register instead
   * (`onSocketPresenceReleased`) and LiveService fills it at startup. Every
   * import still points one way.
   */
  imports: [JwtModule.register({})],
  providers: [RealtimeService, PresenceRegistry, AuctionGateway, UserGateway],
  exports: [RealtimeService, AuctionGateway, UserGateway]
})
export class RealtimeModule {}

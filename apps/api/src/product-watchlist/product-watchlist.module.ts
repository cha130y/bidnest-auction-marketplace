import { Module } from '@nestjs/common';
import { ProductWatchlistController } from './product-watchlist.controller';
import { ProductWatchlistService } from './product-watchlist.service';
import { WatchlistProductsController } from './watchlist-products.controller';

/**
 * Following listings — the e-commerce twin of `WatchlistModule`.
 *
 * Its own module rather than a second service inside that one: the two share
 * no table, no mapper and no rule about what may be followed, and putting them
 * together would mean the auction module and this one could not be worked on
 * without touching the same files.
 *
 * It borrows the product mapper, so a followed row describes a listing exactly
 * as the catalogue does.
 */
@Module({
  controllers: [ProductWatchlistController, WatchlistProductsController],
  providers: [ProductWatchlistService],
  exports: [ProductWatchlistService]
})
export class ProductWatchlistModule {}

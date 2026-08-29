import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';

/**
 * Global because two modules already need it — auctions today, products the
 * moment PROD-001 grows an upload — and neither should have to import the
 * other's plumbing to file a picture.
 */
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService]
})
export class StorageModule {}

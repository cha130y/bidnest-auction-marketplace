import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';

/**
 * No providers of its own: StorageModule is global, and the route is thin
 * enough that a service between it and the store would only forward calls.
 */
@Module({
  controllers: [UploadsController]
})
export class UploadsModule {}

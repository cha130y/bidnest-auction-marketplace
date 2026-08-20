import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { HashingService } from './hashing.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, HashingService],
  exports: [HashingService]
})
export class AuthModule {}

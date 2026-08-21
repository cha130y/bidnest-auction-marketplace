import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { HashingService } from './hashing.service';
import { PasswordResetService } from './password-reset.service';
import { TokenService } from './token.service';
import { TwoFactorService } from './two-factor.service';

@Module({
  // Secrets are passed per sign/verify call in TokenService, since access and
  // refresh use different ones (AUTH-004).
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    HashingService,
    TwoFactorService,
    TokenService,
    PasswordResetService
  ],
  exports: [HashingService, TokenService]
})
export class AuthModule {}

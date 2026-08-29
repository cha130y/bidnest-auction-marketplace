import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { HashingService } from './hashing.service';
import { PasswordResetService } from './password-reset.service';
import { GoogleTokenVerifier } from './oauth/google-token.verifier';
import { LineTokenVerifier } from './oauth/line-token.verifier';
import { GOOGLE_VERIFIER, LINE_VERIFIER } from './oauth/oauth-profile';
import { OAuthService } from './oauth/oauth.service';
import { TokenService } from './token.service';
import { TrustedDeviceService } from './trusted-device.service';
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
    PasswordResetService,
    OAuthService,
    TrustedDeviceService,
    // Bound through symbols so AuthService depends on the interface rather
    // than on either concrete verifier, which is what lets the tests swap in
    // a fake instead of calling Google and Line for real.
    { provide: GOOGLE_VERIFIER, useClass: GoogleTokenVerifier },
    { provide: LINE_VERIFIER, useClass: LineTokenVerifier }
  ],
  // TrustedDeviceService added for AdminModule to reuse: an admin changing
  // their own password (ADM-002) revokes every other session and trusted
  // device the same way AUTH-005's own reset does, since an old password is
  // exactly as untrusted after a deliberate change as after a leaked one.
  // Its own behavior is unchanged; this only widens who may import it.
  exports: [HashingService, TokenService, TrustedDeviceService]
})
export class AuthModule {}

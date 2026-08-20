import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse
} from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import {
  AuthTokensResponse,
  PendingTwoFactorResponse
} from './dto/auth-result.response';
import { AuthUserResponse } from './dto/auth-user.response';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { VerifyTwoFactorDto } from './dto/verify-two-factor.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'AUTH-001 — register a local account',
    description:
      'Creates the account and its profile. Registration does not sign the ' +
      'user in: logging in still goes through email/password plus the ' +
      'mandatory email OTP (AUTH-002 / AUTH-007).'
  })
  @ApiCreatedResponse({ type: AuthUserResponse })
  @ApiConflictResponse({ description: 'Email is already registered' })
  register(@Body() dto: RegisterDto): Promise<AuthUserResponse> {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'AUTH-002 — step one, email and password',
    description:
      'Checks the credentials and mails a one-time code. No token is issued ' +
      'here: post the same credentials plus the code to /auth/2fa/verify to ' +
      'finish signing in.'
  })
  @ApiOkResponse({ type: PendingTwoFactorResponse })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password' })
  @ApiForbiddenResponse({ description: 'Account is suspended or deactivated' })
  login(@Body() dto: LoginDto): Promise<PendingTwoFactorResponse> {
    return this.authService.login(dto);
  }

  @Public()
  @Post('2fa/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'AUTH-007 — step two, exchange the emailed code for tokens',
    description:
      'Takes the original credentials together with the six-digit code. The ' +
      'code is single-use and expires; a wrong, expired or already-spent ' +
      'code all answer the same way on purpose.'
  })
  @ApiOkResponse({ type: AuthTokensResponse })
  @ApiUnauthorizedResponse({ description: 'Bad credentials or bad code' })
  verifyTwoFactor(
    @Body() dto: VerifyTwoFactorDto
  ): Promise<AuthTokensResponse> {
    return this.authService.verifyTwoFactor(dto);
  }

  @Public()
  @Post('2fa/resend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'AUTH-007 — mail a fresh code',
    description:
      'Burns the previous code and sends a new one. Rate limited by ' +
      'OTP_RESEND_COOLDOWN_SECONDS.'
  })
  @ApiOkResponse({ type: PendingTwoFactorResponse })
  @ApiTooManyRequestsResponse({ description: 'Still inside the cooldown' })
  resendTwoFactor(@Body() dto: LoginDto): Promise<PendingTwoFactorResponse> {
    return this.authService.resendTwoFactor(dto);
  }
}

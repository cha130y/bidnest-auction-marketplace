import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { AuthUserResponse } from './dto/auth-user.response';
import { RegisterDto } from './dto/register.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
}

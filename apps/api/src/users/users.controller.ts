import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpdateProfileDto } from './dtos/update-profile.dto';
import { UsersService } from './users.service';

/**
 * USR-001 — the signed-in user's own profile.
 *
 * No @Public() anywhere: every route here is the caller's own data, so the
 * global AccessTokenGuard is exactly the protection wanted.
 */
@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'USR-001 — read your own profile' })
  @ApiOkResponse({ description: 'The profile of the signed-in user' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  findMe(@CurrentUser('id') userId: string) {
    return this.usersService.findMe(userId);
  }

  @Patch('me')
  @ApiOperation({
    summary: 'USR-001 — update your own profile',
    description:
      'A partial update: an omitted field keeps its value, while an explicit ' +
      'null clears an optional one. firstName and displayName cannot be ' +
      'cleared, since public pages fall back to the display name.'
  })
  @ApiOkResponse({ description: 'The profile after the change' })
  @ApiNotFoundResponse({ description: 'User not found' })
  updateMe(@CurrentUser('id') userId: string, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateMe(userId, dto);
  }
}

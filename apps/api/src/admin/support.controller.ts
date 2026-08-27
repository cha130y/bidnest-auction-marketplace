import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ListAdminSupportSessionsDto } from './dtos/list-admin-support-sessions.dto';
import { ReplySupportSessionDto } from './dtos/reply-support-session.dto';
import { AdminSupportService } from './support.service';

/**
 * Admin side of the AI-001 escalation flow (owner: Dev 5) — the queue an
 * admin works from once a user hits "คุยกับแอดมิน" in the chat widget.
 */
@Roles('ADMIN')
@Controller('admin/support/sessions')
export class AdminSupportController {
  constructor(private readonly adminSupportService: AdminSupportService) {}

  @Get()
  listSessions(@Query() query: ListAdminSupportSessionsDto) {
    return this.adminSupportService.listSessions(query);
  }

  @Get(':sessionId')
  getSession(@Param('sessionId') sessionId: string) {
    return this.adminSupportService.getSession(sessionId);
  }

  @Patch(':sessionId/claim')
  claim(
    @Param('sessionId') sessionId: string,
    @CurrentUser('id') adminId: string
  ) {
    return this.adminSupportService.claim(sessionId, adminId);
  }

  @Post(':sessionId/messages')
  reply(
    @Param('sessionId') sessionId: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: ReplySupportSessionDto
  ) {
    return this.adminSupportService.reply(sessionId, adminId, dto.body);
  }

  @Patch(':sessionId/resolve')
  resolve(@Param('sessionId') sessionId: string) {
    return this.adminSupportService.resolve(sessionId);
  }
}

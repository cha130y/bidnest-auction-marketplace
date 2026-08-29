import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ListNotificationDto } from './dtos/list-notification.dto';
import { NotificationService } from './notification.service';

/**
 * NOT-005..008 — one bell for the whole app. Auction and e-commerce rows live
 * in the same table, so serving them from a single route keeps the badge to a
 * single count; `?types=` narrows it when a screen only wants one side.
 */
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  list(@CurrentUser('id') userId: string, @Query() dto: ListNotificationDto) {
    return this.notificationService.list(userId, dto);
  }

  // Declared above the parameterised routes so it is never read as an id
  @Get('unread-count')
  unreadCount(@CurrentUser('id') userId: string) {
    return this.notificationService.unreadCount(userId);
  }

  @Patch('read-all')
  markAllRead(@CurrentUser('id') userId: string) {
    return this.notificationService.markAllRead(userId);
  }

  @Patch(':id/read')
  markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string
  ) {
    return this.notificationService.markRead(userId, id);
  }
}

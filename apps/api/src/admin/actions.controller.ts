import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminActionsService } from './actions.service';
import { ListAdminActionsDto } from './dtos/list-admin-actions.dto';

/**
 * ADM-004 — Audit log viewer (owner: Dev 5)
 *
 * `admin_actions` is a **single** audit table that serves both modules
 * (targetUserId, auctionId, categoryId and productId live on the same row).
 * This is one of the main reasons the Admin role is not split per module —
 * see ADR-0001.
 *
 * This controller is read-only. **Writing** the audit entry is the job of each
 * service that performs the action, inside the same transaction as the data
 * change
 * (Dev 2 = category, Dev 3 = product, Dev 4 = auction, Dev 5 = user)
 */
@Roles('ADMIN')
@Controller('admin/actions')
export class AdminActionsController {
  constructor(private readonly adminActionsService: AdminActionsService) {}

  /**
   * query: cursor?, limit?, actionType? — see ListAdminActionsDto.
   * Returns the acting admin, action type, target, note and time, per ADM-004
   *
   * One DTO rather than three `@Query('name')` strings: the global
   * ValidationPipe only runs against a class metatype, so the string form was
   * unvalidated no matter what it was annotated with.
   */
  @Get()
  listActions(@Query() query: ListAdminActionsDto) {
    return this.adminActionsService.listActions(query);
  }
}

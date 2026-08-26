import { Controller, Get } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminOverviewService } from './overview.service';

@Roles('ADMIN')
@Controller('admin/overview')
export class AdminOverviewController {
  constructor(private readonly overviewService: AdminOverviewService) {}

  @Get()
  getOverview() {
    return this.overviewService.getOverview();
  }
}

import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';

@Controller('health')
export class HealthController {
  /** Liveness probe — must answer without credentials or it is useless. */
  @Public()
  @Get()
  check() {
    return { status: 'ok' };
  }
}

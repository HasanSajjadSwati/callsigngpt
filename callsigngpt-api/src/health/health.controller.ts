import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';

@Controller()
export class HealthController {
  @Public()
  @Get('/healthz')
  healthz() {
    return { ok: true };
  }

  @Public()
  @Get('/readyz')
  readyz() {
    return { ok: true, timestamp: new Date().toISOString() };
  }
}

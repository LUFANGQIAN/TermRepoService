import { Controller, Get } from '@nestjs/common';
import { ok } from '../common/api-response';

@Controller('api/v1/health')
export class ApiHealthController {
  @Get()
  check() {
    return ok({ status: 'up', time: new Date().toISOString() });
  }
}


import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user';
import { ok } from '../common/api-response';
import { BetaService } from './beta.service';

@UseGuards(AuthGuard)
@Controller('api/v1/beta')
export class BetaController {
  constructor(private readonly beta: BetaService) {}

  @Get('status')
  async status(@CurrentUser() user: { id: string }) {
    return ok(await this.beta.status(user.id));
  }

  @Post('apply')
  async apply(@CurrentUser() user: { id: string }, @Body() body: { reason?: string; scope?: string[] }) {
    return ok(await this.beta.apply(user.id, body.reason ?? '', Array.isArray(body.scope) ? body.scope : []));
  }
}


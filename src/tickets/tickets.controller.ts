import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user';
import { ok } from '../common/api-response';
import type { RequestUser } from '../common/request-user';
import { TicketsService } from './tickets.service';

@Controller('api/v1/tickets')
@UseGuards(AuthGuard)
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get()
  async list(@CurrentUser() user: RequestUser, @Query('status') status?: string, @Query('page') page = '1', @Query('pageSize') pageSize = '20') {
    return ok(await this.tickets.listForUser(user.id, status, Number(page), Number(pageSize)));
  }

  @Post()
  async create(
    @CurrentUser() user: RequestUser,
    @Body() body: { title?: string; category?: string; priority?: string; content?: string; attachments?: string[] },
  ) {
    return ok(await this.tickets.create(user.id, body));
  }

  @Get(':id')
  async detail(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return ok(await this.tickets.detailForUser(user.id, id));
  }

  @Post(':id/reply')
  async reply(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() body: { content?: string; attachments?: string[] }) {
    return ok(await this.tickets.replyAsUser(user.id, id, body));
  }

  @Post(':id/close')
  async close(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return ok(await this.tickets.closeForUser(user.id, id));
  }
}

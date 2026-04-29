import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user';
import { AdminGuard } from '../admin/admin.guard';
import { ok } from '../common/api-response';
import type { RequestUser } from '../common/request-user';
import { TicketsService } from './tickets.service';

@Controller('api/v1/admin/tickets')
@UseGuards(AuthGuard, AdminGuard)
export class AdminTicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get()
  async list(@Query('status') status?: string, @Query('q') q = '', @Query('page') page = '1', @Query('pageSize') pageSize = '20') {
    return ok(await this.tickets.listForAdmin({ status, q, page: Number(page), pageSize: Number(pageSize) }));
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    return ok(await this.tickets.detailForAdmin(id));
  }

  @Post(':id/reply')
  async reply(@CurrentUser() admin: RequestUser, @Param('id') id: string, @Body() body: { content?: string; attachments?: string[]; status?: string }) {
    return ok(await this.tickets.replyAsAdmin(admin.id, id, body));
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: { status?: string; priority?: string }) {
    return ok(await this.tickets.updateByAdmin(id, body));
  }
}

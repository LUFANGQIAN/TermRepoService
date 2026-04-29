import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { ok } from '../common/api-response';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

@Controller('api/v1/admin')
@UseGuards(AuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('overview')
  async overview() {
    return ok(await this.admin.overview());
  }

  @Get('ai-provider')
  async aiProvider() {
    return ok(await this.admin.aiProvider());
  }

  @Put('ai-provider')
  async saveAiProvider(@Body() body: { enabled?: boolean; baseUrl?: string; model?: string; apiKey?: string }) {
    return ok(await this.admin.saveAiProvider(body));
  }

  @Post('ai-provider/test')
  async testAiProvider(@Body() body: { baseUrl?: string; model?: string; apiKey?: string }) {
    return ok(await this.admin.testAiProvider(body));
  }

  @Get('default-quotas')
  async defaultQuotas() {
    return ok(await this.admin.defaultQuotas());
  }

  @Put('default-quotas')
  async saveDefaultQuotas(@Body() body: { aiMonthlyQuota?: number; syncTermLimit?: number }) {
    return ok(await this.admin.saveDefaultQuotas(body));
  }

  @Get('users')
  async users(@Query('q') q = '', @Query('page') page = '1', @Query('pageSize') pageSize = '20') {
    return ok(await this.admin.users(q, Number(page), Number(pageSize)));
  }

  @Patch('users/:id')
  async updateUser(
    @Param('id') id: string,
    @Body() body: { aiEnabled?: boolean; syncEnabled?: boolean; aiQuota?: number; aiUsed?: number; syncTermLimit?: number; role?: string },
  ) {
    return ok(await this.admin.updateUser(id, body));
  }
}

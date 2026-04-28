import { Body, Controller, Get, Headers, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user';
import { ok } from '../common/api-response';
import { extractBearerToken } from '../common/plugin-token';
import { AccessTokenService } from '../token/access-token.service';
import { AiService } from './ai.service';

@Controller('api/v1/ai')
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly tokens: AccessTokenService,
  ) {}

  @UseGuards(AuthGuard)
  @Get('status')
  async status(@CurrentUser() user: { id: string }) {
    return ok(await this.ai.status(user.id));
  }

  @UseGuards(AuthGuard)
  @Post('toggle')
  async toggle(@CurrentUser() user: { id: string }, @Body() body: { enabled?: boolean }) {
    return ok(await this.ai.toggle(user.id, body.enabled === true));
  }

  @UseGuards(AuthGuard)
  @Get('usage')
  async usage(@CurrentUser() user: { id: string }, @Query('range') range: '24h' | '7d' | '30d' = '7d') {
    return ok(await this.ai.usage(user.id, range));
  }

  @Post('analyze-term')
  async analyze(@Headers('authorization') auth: string | string[] | undefined, @Body() body: unknown) {
    const token = await this.tokens.requirePluginToken(extractBearerToken(auth), 'ai:analyze');
    return ok(await this.ai.analyzeTerm(token.id, token.userId, body as { originalText?: string; parts?: string[]; filePath?: string; context?: string }));
  }
}


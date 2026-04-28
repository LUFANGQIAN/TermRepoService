import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user';
import { ok } from '../common/api-response';
import { AccessTokenService } from './access-token.service';

@Controller('api/v1/token')
export class TokenController {
  constructor(private readonly tokens: AccessTokenService) {}

  @UseGuards(AuthGuard)
  @Get('current')
  async current(@CurrentUser() user: { id: string }) {
    return ok(await this.tokens.current(user.id));
  }

  @UseGuards(AuthGuard)
  @Post('regenerate')
  async regenerate(@CurrentUser() user: { id: string }) {
    return ok(await this.tokens.regenerate(user.id));
  }

  @Post('validate')
  async validate(@Body() body: { token?: string }) {
    return ok(await this.tokens.validate(body.token ?? ''));
  }
}


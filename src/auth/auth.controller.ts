import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ok } from '../common/api-response';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user';

@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  async register(@Body() body: { email?: string; password?: string; username?: string }) {
    return ok(await this.auth.register(body.email ?? '', body.password ?? '', body.username ?? ''));
  }

  @Post('login')
  async login(@Body() body: { email?: string; password?: string }) {
    return ok(await this.auth.login(body.email ?? '', body.password ?? ''));
  }

  @Post('refresh')
  async refresh(@Body() body: { refreshToken?: string }) {
    return ok(await this.auth.refresh(body.refreshToken ?? ''));
  }

  @UseGuards(AuthGuard)
  @Get('me')
  async me(@CurrentUser() user: { id: string }) {
    return ok(await this.auth.me(user.id));
  }

  @Post('logout')
  async logout(@Body() body: { refreshToken?: string }) {
    return ok(await this.auth.logout(body.refreshToken));
  }
}


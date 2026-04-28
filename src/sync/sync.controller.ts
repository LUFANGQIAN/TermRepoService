import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ok } from '../common/api-response';
import { ApiError } from '../common/api-error';
import { extractBearerToken } from '../common/plugin-token';
import { verifyAccessJwt } from '../common/crypto';
import { AccessTokenService } from '../token/access-token.service';
import { SyncService } from './sync.service';

@Controller('api/v1/sync')
export class SyncController {
  constructor(
    private readonly sync: SyncService,
    private readonly tokens: AccessTokenService,
    private readonly config: ConfigService,
  ) {}

  @Get('status')
  async status(@Headers('authorization') auth: string | string[] | undefined) {
    return ok(await this.sync.status(await this.resolveUserId(auth, 'sync:snapshot')));
  }

  @Post('toggle')
  async toggle(@Headers('authorization') auth: string | string[] | undefined, @Body() body: { enabled?: boolean }) {
    return ok(await this.sync.toggle(await this.resolveUserId(auth, 'sync:snapshot'), body.enabled === true));
  }

  @Get('snapshot/export')
  async exportSnapshot(@Headers('authorization') auth: string | string[] | undefined) {
    return ok(await this.sync.exportSnapshot(await this.resolveUserId(auth, 'sync:snapshot')));
  }

  @Post('snapshot/import')
  async importSnapshot(
    @Headers('authorization') auth: string | string[] | undefined,
    @Body() body: { mode?: 'overwrite' | 'merge'; snapshot?: unknown },
  ) {
    const mode = body.mode === 'merge' ? 'merge' : 'overwrite';
    return ok(await this.sync.importSnapshot(await this.resolveUserId(auth, 'sync:snapshot'), mode, body.snapshot as { terms?: unknown }));
  }

  private async resolveUserId(auth: string | string[] | undefined, scope: string) {
    const tokenValue = extractBearerToken(auth);
    const jwt = verifyAccessJwt(tokenValue, this.config.get<string>('AUTH_JWT_SECRET') ?? 'termrepo-dev-secret');
    if (jwt) return jwt.sub;
    if (tokenValue) return (await this.tokens.requirePluginToken(tokenValue, scope)).userId;
    throw new ApiError(40100, 'missing authorization token');
  }
}


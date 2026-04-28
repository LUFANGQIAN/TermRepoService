import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiError } from '../common/api-error';
import { randomToken } from '../common/crypto';
import { PrismaService } from '../prisma/prisma.service';

const scopeDescriptions: Record<string, string> = {
  'ai:analyze': 'AI term analysis and note suggestions',
  'sync:snapshot': 'Cloud snapshot import and export',
};

@Injectable()
export class AccessTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async current(userId: string) {
    const token = await this.ensureToken(userId);
    return this.toInfo(token);
  }

  async regenerate(userId: string) {
    await this.prisma.accessToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    const token = await this.prisma.accessToken.create({
      data: { token: randomToken('mat', 32), userId, scope: ['ai:analyze', 'sync:snapshot'], aiQuota: 100, aiUsed: 0 },
    });
    return this.toInfo(token);
  }

  async validate(tokenValue: string) {
    const token = await this.prisma.accessToken.findUnique({ where: { token: tokenValue } });
    const valid = Boolean(token && !token.revokedAt && (!token.expiresAt || token.expiresAt.getTime() > Date.now()));
    return { valid, expiresAt: valid && token?.expiresAt ? token.expiresAt.toISOString() : null };
  }

  async requirePluginToken(tokenValue: string, scope: string) {
    const token = await this.prisma.accessToken.findUnique({ where: { token: tokenValue }, include: { user: true } });
    if (!token || token.revokedAt || (token.expiresAt && token.expiresAt.getTime() <= Date.now())) throw new ApiError(40110, 'invalid access token');
    if (!token.scope.includes(scope)) throw new ApiError(40310, 'access token scope denied');
    await this.prisma.accessToken.update({ where: { id: token.id }, data: { lastUsedAt: new Date() } });
    return token;
  }

  private async ensureToken(userId: string) {
    const existing = await this.prisma.accessToken.findFirst({ where: { userId, revokedAt: null }, orderBy: { createdAt: 'desc' } });
    if (existing) return existing;
    return this.prisma.accessToken.create({
      data: { token: randomToken('mat', 32), userId, scope: ['ai:analyze', 'sync:snapshot'], aiQuota: 100, aiUsed: 0 },
    });
  }

  private toInfo(token: { token: string; createdAt: Date; expiresAt: Date | null; scope: string[] }) {
    return {
      token: token.token,
      endpoint: this.config.get<string>('PUBLIC_API_ENDPOINT') ?? 'http://localhost:3000/api/v1',
      version: 'v1',
      valid: !token.expiresAt || token.expiresAt.getTime() > Date.now(),
      issuedAt: token.createdAt.toISOString(),
      expiresAt: token.expiresAt?.toISOString() ?? new Date(Date.now() + 365 * 86400000).toISOString(),
      scopes: token.scope,
      scopeDescriptions,
    };
  }
}


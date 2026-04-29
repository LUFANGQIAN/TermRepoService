import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiError } from '../common/api-error';
import { randomToken } from '../common/crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async overview() {
    const [userCount, aiCalls, snapshots, provider, quotas] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.aiRequest.count(),
      this.prisma.cloudSnapshot.aggregate({ _sum: { termCount: true } }),
      this.settings.getPublicAiProvider(),
      this.settings.getDefaultQuotas(),
    ]);
    return {
      users: { total: userCount },
      ai: { totalCalls: aiCalls, provider },
      sync: { totalTerms: snapshots._sum.termCount ?? 0 },
      defaultQuotas: quotas,
    };
  }

  async aiProvider() {
    return this.settings.getPublicAiProvider();
  }

  async saveAiProvider(input: { enabled?: boolean; baseUrl?: string; model?: string; apiKey?: string }) {
    if (input.baseUrl !== undefined && input.baseUrl.trim() && !/^https?:\/\//i.test(input.baseUrl.trim())) {
      throw new ApiError(40050, 'AI baseUrl must start with http:// or https://');
    }
    if (input.model !== undefined && !input.model.trim()) throw new ApiError(40051, 'AI model is required');
    return this.settings.saveAiProvider(input);
  }

  async testAiProvider(input: { baseUrl?: string; model?: string; apiKey?: string }) {
    const provider = await this.settings.getAiProvider();
    const baseUrl = input.baseUrl?.trim() || provider?.baseUrl || '';
    const model = input.model?.trim() || provider?.model || '';
    const apiKey = input.apiKey?.trim() || (provider ? this.settings.decryptAiKey(provider) : '');
    if (!baseUrl || !model || !apiKey) throw new ApiError(40052, 'AI provider config is incomplete');

    try {
      await this.callChatCompletions(baseUrl, model, apiKey, 'Reply with only: ok');
      return this.settings.updateAiProviderTest('success', 'ok');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI provider test failed';
      await this.settings.updateAiProviderTest('failed', message);
      throw new ApiError(40053, message);
    }
  }

  async defaultQuotas() {
    return this.settings.getDefaultQuotas();
  }

  async saveDefaultQuotas(input: { aiMonthlyQuota?: number; syncTermLimit?: number }) {
    return this.settings.saveDefaultQuotas(input);
  }

  async users(q: string, page: number, pageSize: number) {
    const safePage = Math.max(1, Math.floor(page || 1));
    const safePageSize = Math.min(100, Math.max(1, Math.floor(pageSize || 20)));
    const search = q.trim();
    const where: Prisma.UserWhereInput = search
      ? { OR: [{ email: { contains: search, mode: 'insensitive' } }, { nickname: { contains: search, mode: 'insensitive' } }] }
      : {};
    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        include: {
          accessTokens: { where: { revokedAt: null }, orderBy: { createdAt: 'desc' }, take: 1 },
          cloudSnapshot: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
      }),
    ]);
    return {
      total,
      page: safePage,
      pageSize: safePageSize,
      items: users.map((user) => {
        const token = user.accessTokens[0];
        return {
          id: user.id,
          email: user.email,
          username: user.nickname ?? user.email,
          role: user.role,
          betaStatus: user.betaStatus,
          aiEnabled: user.aiEnabled,
          syncEnabled: user.syncEnabled,
          aiQuota: token?.aiQuota ?? 0,
          aiUsed: token?.aiUsed ?? 0,
          syncTermLimit: user.syncTermLimit,
          syncTermCount: user.cloudSnapshot?.termCount ?? 0,
          createdAt: user.createdAt.toISOString(),
        };
      }),
    };
  }

  async updateUser(id: string, input: { aiEnabled?: boolean; syncEnabled?: boolean; aiQuota?: number; aiUsed?: number; syncTermLimit?: number; role?: string }) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new ApiError(40400, 'user not found');
    const userData: Prisma.UserUpdateInput = {};
    if (typeof input.aiEnabled === 'boolean') userData.aiEnabled = input.aiEnabled;
    if (typeof input.syncEnabled === 'boolean') userData.syncEnabled = input.syncEnabled;
    if (input.syncTermLimit !== undefined) userData.syncTermLimit = this.nonNegativeInt(input.syncTermLimit);
    if (input.role === 'admin' || input.role === 'user') userData.role = input.role;
    if (Object.keys(userData).length > 0) await this.prisma.user.update({ where: { id }, data: userData });

    if (input.aiQuota !== undefined || input.aiUsed !== undefined) {
      const token = await this.ensureToken(id);
      await this.prisma.accessToken.update({
        where: { id: token.id },
        data: {
          aiQuota: input.aiQuota !== undefined ? this.nonNegativeInt(input.aiQuota) : token.aiQuota,
          aiUsed: input.aiUsed !== undefined ? this.nonNegativeInt(input.aiUsed) : token.aiUsed,
        },
      });
    }
    const result = await this.users(user.email, 1, 1);
    return result.items[0];
  }

  private async ensureToken(userId: string) {
    const existing = await this.prisma.accessToken.findFirst({ where: { userId, revokedAt: null }, orderBy: { createdAt: 'desc' } });
    if (existing) return existing;
    const quotas = await this.settings.getDefaultQuotas();
    return this.prisma.accessToken.create({
      data: { token: randomToken('mat', 32), userId, scope: ['ai:analyze', 'sync:snapshot'], aiQuota: quotas.aiMonthlyQuota, aiUsed: 0 },
    });
  }

  private nonNegativeInt(value: unknown) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.floor(parsed);
  }

  private async callChatCompletions(baseUrl: string, model: string, apiKey: string, content: string) {
    const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content }], temperature: 0, max_tokens: 16 }),
    });
    if (!response.ok) throw new Error(`AI provider returned ${response.status}`);
    return response.json() as Promise<unknown>;
  }
}

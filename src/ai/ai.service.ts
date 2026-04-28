import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { ApiError } from '../common/api-error';
import { PrismaService } from '../prisma/prisma.service';

interface AnalyzeTermRequest {
  originalText?: string;
  parts?: string[];
  filePath?: string;
  context?: string;
}

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async status(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { accessTokens: { where: { revokedAt: null }, take: 1 } } });
    if (!user) throw new ApiError(40400, 'user not found');
    const token = user.accessTokens[0];
    const monthlyLimit = token?.aiQuota ?? 100;
    const monthlyUsed = token?.aiUsed ?? 0;
    return {
      enabled: user.aiEnabled,
      model: this.config.get<string>('AI_MODEL') ?? 'termrepo-local-suggester',
      quota: {
        weekly: { limit: Math.ceil(monthlyLimit / 4), used: Math.min(Math.ceil(monthlyUsed / 4), Math.ceil(monthlyLimit / 4)) },
        monthly: { limit: monthlyLimit, used: monthlyUsed },
      },
      resetAt: { weekly: this.nextWeekIso(), monthly: this.nextMonthIso() },
    };
  }

  async toggle(userId: string, enabled: boolean) {
    await this.prisma.user.update({ where: { id: userId }, data: { aiEnabled: enabled } });
    return this.status(userId);
  }

  async usage(userId: string, range: '24h' | '7d' | '30d') {
    const since = new Date(Date.now() - ({ '24h': 1, '7d': 7, '30d': 30 }[range] ?? 7) * 86400000);
    const items = await this.prisma.aiRequest.findMany({ where: { userId, createdAt: { gte: since } }, orderBy: { createdAt: 'desc' }, take: 50 });
    const totalCalls = items.length;
    const successes = items.filter((item) => item.success).length;
    const latencies = items.map((item) => item.latencyMs).filter((value): value is number => typeof value === 'number');
    return {
      summary: {
        totalCalls,
        successRate: totalCalls === 0 ? 1 : successes / totalCalls,
        avgLatencyMs: latencies.length === 0 ? 0 : Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length),
      },
      items: items.map((item) => ({
        id: item.id,
        calledAt: item.createdAt.toISOString(),
        kind: item.kind as 'annotate' | 'split-suggest' | 'rename',
        input: item.word,
        outputPreview: item.outputPreview ?? '',
        latencyMs: item.latencyMs ?? 0,
        success: item.success,
      })),
    };
  }

  async analyzeTerm(accessTokenId: string, userId: string, payload: AnalyzeTermRequest) {
    const startedAt = Date.now();
    const originalText = payload.originalText?.trim();
    if (!originalText) throw new ApiError(40030, 'originalText is required');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.aiEnabled) throw new ApiError(40330, 'AI is disabled for this user');

    const accessToken = await this.prisma.accessToken.findUnique({ where: { id: accessTokenId } });
    if (!accessToken) throw new ApiError(40110, 'invalid access token');
    if (accessToken.aiUsed >= accessToken.aiQuota) throw new ApiError(42930, 'AI quota exceeded');

    const parts = this.normalizeParts(originalText, payload.parts);
    const result = {
      overallNote: this.describe(originalText, payload.context),
      parts: parts.map((text) => ({ text, note: this.partNote(text), tags: this.tagsFor(text), type: this.typeFor(text) })),
      tags: Array.from(new Set(parts.flatMap((text) => this.tagsFor(text)).concat(['termrepo']))),
    };
    const latencyMs = Date.now() - startedAt;
    await this.prisma.$transaction([
      this.prisma.aiRequest.create({
        data: {
          userId,
          word: originalText,
          kind: 'annotate',
          input: payload as Prisma.InputJsonObject,
          output: result,
          outputPreview: result.overallNote.slice(0, 120),
          status: 'success',
          latencyMs,
          success: true,
        },
      }),
      this.prisma.accessToken.update({ where: { id: accessTokenId }, data: { aiUsed: { increment: 1 } } }),
    ]);
    return result;
  }

  private normalizeParts(originalText: string, parts?: string[]) {
    if (Array.isArray(parts) && parts.length > 0) return parts.map((part) => part.trim()).filter(Boolean);
    return originalText.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_\-.]+/g, ' ').split(/\s+/).filter(Boolean);
  }

  private describe(text: string, context?: string) {
    const contextHint = context?.trim() ? '，建议结合调用上下文确认最终含义' : '';
    return `${text} 是一个代码术语或标识符，可作为团队词库条目记录其业务含义、使用场景和命名约定${contextHint}。`;
  }

  private partNote(text: string) {
    return `${text} 片段建议记录其在当前标识符中的语义角色。`;
  }

  private tagsFor(text: string) {
    const tags = ['identifier'];
    if (/id$/i.test(text)) tags.push('identity');
    if (/token|auth|session/i.test(text)) tags.push('auth');
    if (/api|http|request|response/i.test(text)) tags.push('api');
    return tags;
  }

  private typeFor(text: string) {
    if (/^[A-Z][a-z]+$/.test(text)) return 'PascalPart';
    if (/^[A-Z_]+$/.test(text)) return 'constant';
    return 'identifier-part';
  }

  private nextWeekIso() {
    return new Date(Date.now() + 7 * 86400000).toISOString();
  }

  private nextMonthIso() {
    const date = new Date();
    date.setMonth(date.getMonth() + 1, 1);
    date.setHours(0, 0, 0, 0);
    return date.toISOString();
  }
}

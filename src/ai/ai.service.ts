import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { ApiError } from '../common/api-error';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

interface AnalyzeTermRequest {
  originalText?: string;
  parts?: string[];
  filePath?: string;
  fileName?: string;
  languageId?: string;
  context?: string;
  surroundingCode?: string;
  targetLanguage?: string;
}

export interface AiTermPart {
  text: string;
  note: string;
  tags: string[];
  type?: string;
}

export interface AiTermResult {
  overallNote: string;
  parts: AiTermPart[];
  tags: string[];
}

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly settings: SettingsService,
  ) {}

  async status(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { accessTokens: { where: { revokedAt: null }, take: 1 } } });
    if (!user) throw new ApiError(40400, 'user not found');
    const token = user.accessTokens[0];
    const monthlyLimit = token?.aiQuota ?? 0;
    const monthlyUsed = token?.aiUsed ?? 0;
    const provider = await this.settings.getPublicAiProvider();
    return {
      enabled: user.aiEnabled,
      model: provider.configured ? provider.model : '',
      provider,
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

    const provider = await this.settings.getAiProvider();
    if (!this.settings.isAiProviderReady(provider)) throw new ApiError(50330, 'AI provider is not configured');

    try {
      const parts = this.normalizeParts(originalText, payload.parts);
      const result = await this.callProvider(provider.baseUrl, provider.model, this.settings.decryptAiKey(provider), {
        ...payload,
        originalText,
        parts,
      });
      const normalized = this.normalizeResult(result, originalText, parts);
      const latencyMs = Date.now() - startedAt;
      await this.prisma.$transaction([
        this.prisma.aiRequest.create({
          data: {
            userId,
            word: originalText,
            kind: 'annotate',
            input: payload as Prisma.InputJsonObject,
            output: normalized as unknown as Prisma.InputJsonObject,
            outputPreview: normalized.overallNote.slice(0, 120),
            status: 'success',
            latencyMs,
            success: true,
          },
        }),
        this.prisma.accessToken.update({ where: { id: accessTokenId }, data: { aiUsed: { increment: 1 } } }),
      ]);
      return normalized;
    } catch (error) {
      const latencyMs = Date.now() - startedAt;
      const message = error instanceof Error ? error.message : 'AI analysis failed';
      await this.prisma.aiRequest.create({
        data: {
          userId,
          word: originalText,
          kind: 'annotate',
          input: payload as Prisma.InputJsonObject,
          outputPreview: message.slice(0, 120),
          status: 'failed',
          latencyMs,
          success: false,
        },
      });
      throw new ApiError(50331, message);
    }
  }

  private async callProvider(baseUrl: string, model: string, apiKey: string, payload: AnalyzeTermRequest & { originalText: string; parts: string[] }) {
    const timeoutMs = Number(this.config.get<string>('AI_REQUEST_TIMEOUT_MS') ?? 30000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: this.systemPrompt() },
            { role: 'user', content: JSON.stringify(payload) },
          ],
        }),
      });
      if (!response.ok) throw new Error(`AI provider returned ${response.status}`);
      const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('AI provider returned empty content');
      return this.parseJson(content);
    } finally {
      clearTimeout(timer);
    }
  }

  private systemPrompt() {
    return [
      '你是 TermRepo 的开发者术语翻译助手。',
      '请解释代码标识符或术语，目标语言默认简体中文。',
      '只返回 JSON，不要 Markdown。',
      'JSON 结构必须是：{"overallNote":"...","parts":[{"text":"...","note":"...","tags":["..."],"type":"..."}],"tags":["..."]}。',
      'overallNote 应简洁说明该术语在代码或业务中的可能含义。',
      'parts 必须覆盖用户给出的 parts。',
    ].join('\n');
  }

  private parseJson(content: string): unknown {
    try {
      return JSON.parse(content);
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('AI provider returned invalid JSON');
      return JSON.parse(match[0]);
    }
  }

  private normalizeResult(value: unknown, originalText: string, parts: string[]): AiTermResult {
    const data = value as Partial<AiTermResult>;
    const normalizedParts = parts.map((part) => {
      const hit = Array.isArray(data.parts) ? data.parts.find((item) => item?.text?.toLowerCase() === part.toLowerCase()) : undefined;
      return {
        text: part,
        note: typeof hit?.note === 'string' && hit.note.trim() ? hit.note.trim() : `${part} 的含义需要结合上下文确认。`,
        tags: Array.isArray(hit?.tags) ? hit.tags.filter((tag): tag is string => typeof tag === 'string') : [],
        type: typeof hit?.type === 'string' ? hit.type : this.typeFor(part),
      };
    });
    return {
      overallNote: typeof data.overallNote === 'string' && data.overallNote.trim() ? data.overallNote.trim() : `${originalText} 是一个代码术语或标识符。`,
      parts: normalizedParts,
      tags: Array.from(new Set((Array.isArray(data.tags) ? data.tags : []).filter((tag): tag is string => typeof tag === 'string').concat(normalizedParts.flatMap((part) => part.tags)).concat(['termrepo']))),
    };
  }

  private normalizeParts(originalText: string, parts?: string[]) {
    if (Array.isArray(parts) && parts.length > 0) return parts.map((part) => part.trim()).filter(Boolean);
    return originalText.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_\-.]+/g, ' ').split(/\s+/).filter(Boolean);
  }

  private typeFor(text: string) {
    if (/^[A-Z][A-Za-z0-9]*$/.test(text)) return 'PascalCasePart';
    if (/^[a-z][A-Za-z0-9]*$/.test(text)) return 'camelCasePart';
    if (/^[A-Z0-9_]+$/.test(text)) return 'constantPart';
    return 'termPart';
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

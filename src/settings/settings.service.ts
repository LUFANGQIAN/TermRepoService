import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { decryptSecret, encryptSecret } from '../common/crypto';
import { PrismaService } from '../prisma/prisma.service';

export interface AiProviderConfig {
  enabled: boolean;
  baseUrl: string;
  model: string;
  apiKeyEncrypted?: string;
  lastTestStatus?: 'success' | 'failed' | 'untested';
  lastTestMessage?: string;
  lastTestAt?: string;
  updatedAt?: string;
}

export interface DefaultQuotaConfig {
  aiMonthlyQuota: number;
  syncTermLimit: number;
}

const AI_PROVIDER_KEY = 'ai_provider';
const DEFAULT_QUOTAS_KEY = 'default_quotas';

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async getAiProvider(): Promise<AiProviderConfig | null> {
    const setting = await this.prisma.appSetting.findUnique({ where: { key: AI_PROVIDER_KEY } });
    if (!setting) return null;
    const value = setting.value as unknown as Partial<AiProviderConfig>;
    return {
      enabled: value.enabled === true,
      baseUrl: typeof value.baseUrl === 'string' ? value.baseUrl : '',
      model: typeof value.model === 'string' ? value.model : '',
      apiKeyEncrypted: typeof value.apiKeyEncrypted === 'string' ? value.apiKeyEncrypted : undefined,
      lastTestStatus: value.lastTestStatus ?? 'untested',
      lastTestMessage: typeof value.lastTestMessage === 'string' ? value.lastTestMessage : undefined,
      lastTestAt: typeof value.lastTestAt === 'string' ? value.lastTestAt : undefined,
      updatedAt: setting.updatedAt.toISOString(),
    };
  }

  async getPublicAiProvider() {
    const provider = await this.getAiProvider();
    return this.toPublicAiProvider(provider);
  }

  async saveAiProvider(input: { enabled?: boolean; baseUrl?: string; model?: string; apiKey?: string }) {
    const current = await this.getAiProvider();
    const value: AiProviderConfig = {
      enabled: input.enabled ?? current?.enabled ?? false,
      baseUrl: input.baseUrl?.trim() ?? current?.baseUrl ?? '',
      model: input.model?.trim() ?? current?.model ?? '',
      apiKeyEncrypted: input.apiKey?.trim()
        ? encryptSecret(input.apiKey.trim(), this.secretKey())
        : current?.apiKeyEncrypted,
      lastTestStatus: current?.lastTestStatus ?? 'untested',
      lastTestMessage: current?.lastTestMessage,
      lastTestAt: current?.lastTestAt,
    };
    const saved = await this.prisma.appSetting.upsert({
      where: { key: AI_PROVIDER_KEY },
      create: { key: AI_PROVIDER_KEY, value: value as unknown as Prisma.InputJsonValue },
      update: { value: value as unknown as Prisma.InputJsonValue },
    });
    return this.toPublicAiProvider({ ...value, updatedAt: saved.updatedAt.toISOString() });
  }

  async updateAiProviderTest(status: 'success' | 'failed', message: string) {
    const current = await this.getAiProvider();
    const value: AiProviderConfig = {
      enabled: current?.enabled ?? false,
      baseUrl: current?.baseUrl ?? '',
      model: current?.model ?? '',
      apiKeyEncrypted: current?.apiKeyEncrypted,
      lastTestStatus: status,
      lastTestMessage: message.slice(0, 240),
      lastTestAt: new Date().toISOString(),
    };
    await this.prisma.appSetting.upsert({
      where: { key: AI_PROVIDER_KEY },
      create: { key: AI_PROVIDER_KEY, value: value as unknown as Prisma.InputJsonValue },
      update: { value: value as unknown as Prisma.InputJsonValue },
    });
    return this.toPublicAiProvider(value);
  }

  decryptAiKey(provider: AiProviderConfig): string {
    if (!provider.apiKeyEncrypted) return '';
    return decryptSecret(provider.apiKeyEncrypted, this.secretKey());
  }

  isAiProviderReady(provider: AiProviderConfig | null): provider is AiProviderConfig {
    return Boolean(provider?.enabled && provider.baseUrl && provider.model && provider.apiKeyEncrypted);
  }

  async getDefaultQuotas(): Promise<DefaultQuotaConfig> {
    const setting = await this.prisma.appSetting.findUnique({ where: { key: DEFAULT_QUOTAS_KEY } });
    const value = setting?.value as unknown as Partial<DefaultQuotaConfig> | undefined;
    return {
      aiMonthlyQuota: this.positiveInt(value?.aiMonthlyQuota, 100),
      syncTermLimit: this.positiveInt(value?.syncTermLimit, 500),
    };
  }

  async saveDefaultQuotas(input: Partial<DefaultQuotaConfig>) {
    const value: DefaultQuotaConfig = {
      aiMonthlyQuota: this.positiveInt(input.aiMonthlyQuota, 100),
      syncTermLimit: this.positiveInt(input.syncTermLimit, 500),
    };
    await this.prisma.appSetting.upsert({
      where: { key: DEFAULT_QUOTAS_KEY },
      create: { key: DEFAULT_QUOTAS_KEY, value: value as unknown as Prisma.InputJsonValue },
      update: { value: value as unknown as Prisma.InputJsonValue },
    });
    return value;
  }

  toPublicAiProvider(provider: AiProviderConfig | null) {
    return {
      configured: this.isAiProviderReady(provider),
      enabled: provider?.enabled === true,
      baseUrl: provider?.baseUrl ?? '',
      model: provider?.model ?? '',
      hasApiKey: Boolean(provider?.apiKeyEncrypted),
      lastTestStatus: provider?.lastTestStatus ?? 'untested',
      lastTestMessage: provider?.lastTestMessage ?? '',
      lastTestAt: provider?.lastTestAt ?? null,
      updatedAt: provider?.updatedAt ?? null,
    };
  }

  private positiveInt(value: unknown, fallback: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return fallback;
    return Math.floor(parsed);
  }

  private secretKey() {
    return this.config.get<string>('APP_SECRET_ENCRYPTION_KEY') ?? this.config.get<string>('AUTH_JWT_SECRET') ?? 'termrepo-dev-secret';
  }
}

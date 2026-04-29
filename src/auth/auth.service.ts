import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { ApiError } from '../common/api-error';
import { createAccessJwt, hashPassword, hashValue, randomToken, verifyPassword } from '../common/crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  role: string;
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly settings: SettingsService,
  ) {}

  async register(email: string, password: string, username: string) {
    this.assertEmail(email);
    this.assertPassword(password);
    if (!username.trim()) throw new ApiError(40003, 'username is required');
    const quotas = await this.settings.getDefaultQuotas();

    try {
      const user = await this.prisma.user.create({
        data: {
          email: email.trim().toLowerCase(),
          nickname: username.trim(),
          passwordHash: hashPassword(password),
          syncTermLimit: quotas.syncTermLimit,
        },
      });
      await this.ensureAccessToken(user.id);
      return this.issueAuth(user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ApiError(40900, 'email already registered');
      }
      throw error;
    }
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user || !verifyPassword(password, user.passwordHash)) throw new ApiError(40102, 'invalid email or password');
    await this.ensureAccessToken(user.id);
    return this.issueAuth(user);
  }

  async refresh(refreshToken: string) {
    const session = await this.prisma.refreshSession.findUnique({
      where: { tokenHash: hashValue(refreshToken) },
      include: { user: true },
    });
    if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) throw new ApiError(40103, 'invalid refresh token');
    return this.issueAuth(session.user, refreshToken);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { accessTokens: { where: { revokedAt: null }, orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!user) throw new ApiError(40400, 'user not found');
    const token = user.accessTokens[0];
    return {
      id: user.id,
      email: user.email,
      username: user.nickname ?? user.email,
      betaStatus: user.betaStatus as 'none' | 'pending' | 'approved' | 'rejected',
      aiEnabled: user.aiEnabled,
      syncEnabled: user.syncEnabled,
      syncTermLimit: user.syncTermLimit,
      role: user.role,
      tokenValid: Boolean(token && (!token.expiresAt || token.expiresAt.getTime() > Date.now())),
      createdAt: user.createdAt.toISOString(),
    };
  }

  async logout(refreshToken?: string) {
    if (refreshToken) {
      await this.prisma.refreshSession.updateMany({
        where: { tokenHash: hashValue(refreshToken), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return null;
  }

  private async issueAuth(user: { id: string; email: string; nickname: string | null; role?: string; createdAt: Date }, existingRefreshToken?: string): Promise<AuthResponse> {
    const accessToken = createAccessJwt(
      { sub: user.id, email: user.email },
      this.config.get<string>('AUTH_JWT_SECRET') ?? 'termrepo-dev-secret',
      Number(this.config.get<string>('AUTH_ACCESS_TOKEN_TTL_SECONDS') ?? 3600),
    );
    const refreshToken = existingRefreshToken ?? randomToken('trr', 32);
    if (!existingRefreshToken) {
      await this.prisma.refreshSession.create({
        data: {
          tokenHash: hashValue(refreshToken),
          userId: user.id,
          expiresAt: new Date(Date.now() + Number(this.config.get<string>('AUTH_REFRESH_TOKEN_TTL_DAYS') ?? 30) * 86400000),
        },
      });
    }
    return { accessToken, refreshToken, user: this.toAuthUser(user) };
  }

  private toAuthUser(user: { id: string; email: string; nickname: string | null; role?: string; createdAt: Date }): AuthUser {
    return { id: user.id, email: user.email, username: user.nickname ?? user.email, role: user.role ?? 'user', createdAt: user.createdAt.toISOString() };
  }

  private async ensureAccessToken(userId: string) {
    const existing = await this.prisma.accessToken.findFirst({ where: { userId, revokedAt: null } });
    if (existing) return existing;
    const quotas = await this.settings.getDefaultQuotas();
    return this.prisma.accessToken.create({
      data: { token: randomToken('mat', 32), userId, scope: ['ai:analyze', 'sync:snapshot'], aiQuota: quotas.aiMonthlyQuota, aiUsed: 0 },
    });
  }

  private assertEmail(email: string) {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) throw new ApiError(40001, 'valid email is required');
  }

  private assertPassword(password: string) {
    if (password.length < 8) throw new ApiError(40002, 'password must be at least 8 characters');
  }
}

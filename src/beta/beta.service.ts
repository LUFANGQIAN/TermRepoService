import { Injectable } from '@nestjs/common';
import { ApiError } from '../common/api-error';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BetaService {
  constructor(private readonly prisma: PrismaService) {}

  async status(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { betaApplications: { orderBy: { createdAt: 'desc' }, take: 1 } } });
    if (!user) throw new ApiError(40400, 'user not found');
    const latest = user.betaApplications[0];
    return {
      status: user.betaStatus as 'none' | 'pending' | 'approved' | 'rejected',
      appliedAt: latest?.createdAt.toISOString(),
      approvedAt: user.betaStatus === 'approved' ? latest?.updatedAt.toISOString() : undefined,
      scope: latest?.scope ?? [],
      note: latest?.note,
    };
  }

  async apply(userId: string, reason: string, scope: string[]) {
    if (!reason.trim()) throw new ApiError(40020, 'application reason is required');
    const application = await this.prisma.betaApplication.create({ data: { userId, reason: reason.trim(), scope, status: 'pending' } });
    await this.prisma.user.update({ where: { id: userId }, data: { betaStatus: 'pending' } });
    return { status: 'pending' as const, appliedAt: application.createdAt.toISOString() };
  }
}


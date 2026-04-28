import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiError } from '../common/api-error';
import { PrismaService } from '../prisma/prisma.service';

interface TermSnapshot {
  version?: number;
  exportedAt?: string;
  terms?: unknown;
}

@Injectable()
export class SyncService {
  constructor(private readonly prisma: PrismaService) {}

  async status(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { cloudSnapshot: true } });
    if (!user) throw new ApiError(40400, 'user not found');
    return {
      enabled: user.syncEnabled,
      termCount: user.cloudSnapshot?.termCount ?? 0,
      lastSyncAt: user.cloudSnapshot?.updatedAt.toISOString() ?? null,
      lastSyncStatus: user.cloudSnapshot?.lastSyncStatus ?? 'success',
      pendingConflicts: 0,
      snapshotVersion: user.cloudSnapshot?.version ?? 0,
    };
  }

  async toggle(userId: string, enabled: boolean) {
    await this.prisma.user.update({ where: { id: userId }, data: { syncEnabled: enabled } });
    return this.status(userId);
  }

  async exportSnapshot(userId: string) {
    const snapshot = await this.prisma.cloudSnapshot.findUnique({ where: { userId } });
    if (!snapshot) {
      return { version: 0, exportedAt: new Date().toISOString(), terms: [] };
    }
    const data = snapshot.snapshot as TermSnapshot;
    return {
      version: snapshot.version,
      exportedAt: new Date().toISOString(),
      terms: Array.isArray(data.terms) ? data.terms : [],
    };
  }

  async importSnapshot(userId: string, mode: 'overwrite' | 'merge', snapshot: TermSnapshot) {
    const terms = this.extractTerms(snapshot);
    const existing = await this.prisma.cloudSnapshot.findUnique({ where: { userId } });
    const mergedTerms = mode === 'merge' && existing ? this.mergeTerms(existing.snapshot as TermSnapshot, terms) : terms;
    const version = (existing?.version ?? 0) + 1;
    const snapshotData = { version, exportedAt: new Date().toISOString(), terms: mergedTerms } as Prisma.InputJsonObject;
    await this.prisma.cloudSnapshot.upsert({
      where: { userId },
      create: {
        userId,
        version,
        termCount: mergedTerms.length,
        snapshot: snapshotData,
        lastSyncStatus: 'success',
      },
      update: {
        version,
        termCount: mergedTerms.length,
        snapshot: snapshotData,
        lastSyncStatus: 'success',
      },
    });
    await this.prisma.user.update({ where: { id: userId }, data: { syncEnabled: true } });
    return { imported: terms.length, skipped: mode === 'merge' ? terms.length - this.countNewTerms(existing?.snapshot as TermSnapshot | undefined, terms) : 0, snapshotVersion: version };
  }

  private extractTerms(snapshot: TermSnapshot) {
    if (!snapshot || !Array.isArray(snapshot.terms)) throw new ApiError(40040, 'snapshot.terms must be an array');
    return snapshot.terms.filter((term): term is Record<string, unknown> => Boolean(term) && typeof term === 'object');
  }

  private mergeTerms(existingSnapshot: TermSnapshot, incomingTerms: Record<string, unknown>[]) {
    const byKey = new Map<string, Record<string, unknown>>();
    for (const term of this.extractTerms({ terms: existingSnapshot.terms })) byKey.set(this.termKey(term), term);
    for (const term of incomingTerms) {
      const key = this.termKey(term);
      if (!byKey.has(key)) byKey.set(key, term);
    }
    return Array.from(byKey.values());
  }

  private countNewTerms(existingSnapshot: TermSnapshot | undefined, incomingTerms: Record<string, unknown>[]) {
    if (!existingSnapshot) return incomingTerms.length;
    const existingKeys = new Set(this.extractTerms({ terms: existingSnapshot.terms }).map((term) => this.termKey(term)));
    return incomingTerms.filter((term) => !existingKeys.has(this.termKey(term))).length;
  }

  private termKey(term: Record<string, unknown>) {
    if (typeof term.id === 'string' || typeof term.id === 'number') return String(term.id);
    if (typeof term.originalText === 'string' || typeof term.originalText === 'number') return String(term.originalText);
    return JSON.stringify(term);
  }
}

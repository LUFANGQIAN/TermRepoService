import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hashPassword } from '../common/crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminBootstrapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    const email = this.config.get<string>('ADMIN_EMAIL')?.trim().toLowerCase();
    const password = this.config.get<string>('ADMIN_PASSWORD') ?? '';
    const username = this.config.get<string>('ADMIN_USERNAME')?.trim() || 'TermRepo Admin';
    if (!email || !password) {
      this.logger.warn('ADMIN_EMAIL or ADMIN_PASSWORD is not configured; admin bootstrap skipped.');
      return;
    }
    if (password.length < 8) {
      this.logger.warn('ADMIN_PASSWORD must be at least 8 characters; admin bootstrap skipped.');
      return;
    }

    await this.prisma.user.upsert({
      where: { email },
      create: {
        email,
        nickname: username,
        passwordHash: hashPassword(password),
        role: 'admin',
        aiEnabled: true,
        syncEnabled: true,
      },
      update: {
        nickname: username,
        passwordHash: hashPassword(password),
        role: 'admin',
      },
    });
    this.logger.log(`Admin account ensured: ${email}`);
  }
}

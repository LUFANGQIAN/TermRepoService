import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { SettingsModule } from './settings/settings.module';
import { HealthModule } from './health/health.module';
import { ApiHealthModule } from './api-health/api-health.module';
import { AuthModule } from './auth/auth.module';
import { TokenModule } from './token/token.module';
import { BetaModule } from './beta/beta.module';
import { AiModule } from './ai/ai.module';
import { SyncModule } from './sync/sync.module';
import { AdminModule } from './admin/admin.module';
import { TicketsModule } from './tickets/tickets.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    SettingsModule,
    HealthModule,
    ApiHealthModule,
    AuthModule,
    TokenModule,
    BetaModule,
    AiModule,
    SyncModule,
    AdminModule,
    TicketsModule,
  ],
})
export class AppModule {}

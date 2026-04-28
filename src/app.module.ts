import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { ApiHealthModule } from './api-health/api-health.module';
import { AuthModule } from './auth/auth.module';
import { TokenModule } from './token/token.module';
import { BetaModule } from './beta/beta.module';
import { AiModule } from './ai/ai.module';
import { SyncModule } from './sync/sync.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    ApiHealthModule,
    AuthModule,
    TokenModule,
    BetaModule,
    AiModule,
    SyncModule,
  ],
})
export class AppModule {}

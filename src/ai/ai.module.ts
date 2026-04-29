import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SettingsModule } from '../settings/settings.module';
import { TokenModule } from '../token/token.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  imports: [AuthModule, PrismaModule, TokenModule, SettingsModule],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}

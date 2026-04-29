import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SettingsModule } from '../settings/settings.module';
import { AccessTokenService } from './access-token.service';
import { TokenController } from './token.controller';

@Module({
  imports: [PrismaModule, AuthModule, SettingsModule],
  controllers: [TokenController],
  providers: [AccessTokenService],
  exports: [AccessTokenService],
})
export class TokenModule {}

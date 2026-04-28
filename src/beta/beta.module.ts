import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BetaController } from './beta.controller';
import { BetaService } from './beta.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [BetaController],
  providers: [BetaService],
})
export class BetaModule {}


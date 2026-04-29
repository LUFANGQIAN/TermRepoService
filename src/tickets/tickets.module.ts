import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminTicketsController } from './admin-tickets.controller';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [TicketsController, AdminTicketsController],
  providers: [TicketsService],
})
export class TicketsModule {}

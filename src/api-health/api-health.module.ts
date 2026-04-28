import { Module } from '@nestjs/common';
import { ApiHealthController } from './api-health.controller';

@Module({ controllers: [ApiHealthController] })
export class ApiHealthModule {}


import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ApiError } from '../common/api-error';
import { RequestWithUser } from '../common/request-user';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (!request.user) throw new ApiError(40101, 'invalid authorization token');
    const user = await this.prisma.user.findUnique({ where: { id: request.user.id } });
    if (!user || user.role !== 'admin') throw new ApiError(40300, 'admin permission required');
    request.user.role = user.role;
    return true;
  }
}

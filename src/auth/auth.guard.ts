import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verifyAccessJwt } from '../common/crypto';
import { RequestWithUser } from '../common/request-user';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const raw = request.headers.authorization;
    const auth = Array.isArray(raw) ? raw[0] : raw;
    const token = auth?.replace(/^Bearer\s+/i, '');
    if (!token) throw new UnauthorizedException({ code: 40100, message: 'missing authorization token', data: null });

    const payload = verifyAccessJwt(token, this.config.get<string>('AUTH_JWT_SECRET') ?? 'termrepo-dev-secret');
    if (!payload) throw new UnauthorizedException({ code: 40101, message: 'invalid authorization token', data: null });

    request.user = { id: payload.sub, email: payload.email };
    return true;
  }
}


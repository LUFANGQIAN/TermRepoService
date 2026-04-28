import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestUser, RequestWithUser } from '../common/request-user';

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): RequestUser => {
  const request = ctx.switchToHttp().getRequest<RequestWithUser>();
  if (!request.user) throw new Error('CurrentUser used without AuthGuard');
  return request.user;
});


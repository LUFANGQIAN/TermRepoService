import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      if (typeof payload === 'object' && payload !== null && 'code' in payload && 'message' in payload) {
        response.status(status).json(payload);
        return;
      }
      response.status(status).json({ code: status, message: exception.message, data: null });
      return;
    }

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ code: 50000, message: 'internal server error', data: null });
  }
}


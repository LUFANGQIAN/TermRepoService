import { HttpException, HttpStatus } from '@nestjs/common';

export class ApiError extends HttpException {
  constructor(
    public readonly code: number,
    message: string,
    status: HttpStatus = HttpStatus.OK,
  ) {
    super({ code, message, data: null }, status);
  }
}


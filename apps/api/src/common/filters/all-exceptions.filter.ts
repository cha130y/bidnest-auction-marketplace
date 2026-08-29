import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * SRS section 6 — "ส่ง error ที่เป็นประโยชน์กลับไปโดยไม่หลุดรายละเอียดการ
 * implement ออกไป". HttpExceptions we raise on purpose are passed through as
 * written; anything else is logged in full server-side and reported to the
 * client as a bare 500 so stack traces and driver errors never leave the API.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return response.status(status).json(exception.getResponse());
    }

    this.logger.error(
      `Unhandled exception on ${request.method} ${request.url}`,
      exception instanceof Error ? exception.stack : String(exception)
    );

    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error'
    });
  }
}

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '../../../generated/prisma/client';

@Catch(Prisma.PrismaClientKnownRequestError, Prisma.PrismaClientValidationError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errorCode = 'Unknown';

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      errorCode = exception.code;

      switch (exception.code) {
        case 'P2002':
          status = HttpStatus.CONFLICT;
          message = 'Conflict: ข้อมูลนี้มีอยู่แล้วในระบบ';
          break;
        case 'P2025':
          status = HttpStatus.NOT_FOUND;
          message = 'Not Found: ไม่พบข้อมูลที่ต้องการ';
          break;
        case 'P2003':
          status = HttpStatus.BAD_REQUEST;
          message = 'Bad Request: อ้างอิงข้อมูลที่ไม่มีอยู่จริง';
          break;
        default:
          status = HttpStatus.BAD_REQUEST;
          message = 'Bad Request: ฐานข้อมูลปฏิเสธ operation นี้';
          this.logger.error(
            `Unhandled Prisma error [${errorCode}]: ${exception.message.replace(/\n/g, ' ')}`,
          );
          break;
      }
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      message = 'Bad Request: ข้อมูลที่ส่งมาไม่ถูกต้อง';
      errorCode = 'ValidationError';
      this.logger.error(
        `Prisma validation error: ${exception.message.replace(/\n/g, ' ')}`,
      );
    }

    response
      .status(status)
      .json({ statusCode: status, message, error: errorCode });
  }
}

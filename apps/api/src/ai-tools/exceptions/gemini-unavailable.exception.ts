import { HttpException, HttpStatus } from '@nestjs/common';

export class GeminiUnavailableException extends HttpException {
  constructor(cause?: unknown) {
    super(
      {
        message:
          'ระบบผู้ช่วย AI ขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้งในอีกสักครู่',
        code: 'GEMINI_UNAVAILABLE'
      },
      HttpStatus.SERVICE_UNAVAILABLE,
      { cause: cause as Error }
    );
  }
}

import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { SendMessageDto } from '../../support-chat/dto/send-message.dto';

const INJECTION_PATTERNS = [
  /ignore (all )?previous instructions/i,
  /disregard (all )?(the )?(system|above) (prompt|instructions)/i,
  /you are now/i,
  /system\s*:/i,
  /ลืมคำสั่ง(ก่อนหน้า)?/,
  /ตอบแบบไม่มีข้อจำกัด/
];

@Injectable()
export class SanitizePromptPipe implements PipeTransform<
  SendMessageDto,
  SendMessageDto
> {
  transform(value: SendMessageDto): SendMessageDto {
    const suspicious = INJECTION_PATTERNS.some((pattern) =>
      pattern.test(value.message)
    );

    if (suspicious) {
      throw new BadRequestException(
        'ข้อความมีรูปแบบที่ไม่สามารถประมวลผลได้ กรุณาถามคำถามเกี่ยวกับการใช้งาน BidNest'
      );
    }

    return value;
  }
}

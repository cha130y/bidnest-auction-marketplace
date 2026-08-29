import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

/**
 * Every secret we persist goes through here — passwords now (AUTH-001), OTP
 * codes and reset tokens later (AUTH-005 / AUTH-007). SRS section 6 requires
 * all of them to be hashed before they touch the database.
 */
@Injectable()
export class HashingService {
  /** bcrypt silently ignores input past 72 bytes, so DTOs cap length there. */
  private readonly saltRounds = 12;

  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.saltRounds);
  }

  compare(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}

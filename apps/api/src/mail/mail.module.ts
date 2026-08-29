import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';

/**
 * Global because AUTH-005 and AUTH-007 both send mail, and later requirements
 * (notifications) will too — none of them should wire up a second transport.
 */
@Global()
@Module({
  providers: [MailService],
  exports: [MailService]
})
export class MailModule {}

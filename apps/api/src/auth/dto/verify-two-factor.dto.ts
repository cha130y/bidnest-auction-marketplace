import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches } from 'class-validator';
import { LoginDto } from './login.dto';

/**
 * AUTH-002 step two — "ต้องส่งคำขอครั้งที่สองพร้อมข้อมูล login เดิม บวกกับ OTP".
 *
 * Carrying the credentials again (rather than handing out an intermediate
 * "pending" token) means there is no half-authenticated bearer to steal, and it
 * matches how NextAuth's Credentials provider works: it calls authorize() once,
 * so the client collects password and OTP across two screens and posts them
 * together in a single signIn().
 */
export class VerifyTwoFactorDto extends LoginDto {
  @ApiProperty({ example: '043915', description: 'Six-digit code from email' })
  @IsString()
  @Transform(({ value }: { value: string }) => value?.trim())
  @Matches(/^\d{6}$/, { message: 'otp must be exactly six digits' })
  otp: string;
}

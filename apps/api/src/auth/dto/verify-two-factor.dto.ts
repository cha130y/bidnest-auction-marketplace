import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength
} from 'class-validator';
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

  @ApiPropertyOptional({
    description:
      'AUTH-007 — remember this browser, so the next login from it is not ' +
      'asked for a code. A device token comes back in the response when set.',
    default: false
  })
  @IsOptional()
  @IsBoolean()
  @Transform(
    ({ value }: { value: unknown }) => value === true || value === 'true'
  )
  rememberDevice?: boolean;

  @ApiPropertyOptional({
    description:
      'What to call this browser on a "your devices" screen. Trimmed to the ' +
      'browser and platform; never anything that identifies a person.',
    example: 'Chrome on Windows'
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }: { value: string }) => value?.trim())
  deviceLabel?: string;
}

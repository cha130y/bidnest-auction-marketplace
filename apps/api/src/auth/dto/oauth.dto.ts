import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength
} from 'class-validator';

/**
 * AUTH-003 / AUTH-006 step one. The ID token is the only credential: nothing
 * the caller says about themselves is trusted, because the server verifies the
 * token with the provider and reads the identity out of the response.
 */
export class OAuthLoginDto {
  @ApiProperty({ description: 'ID token from Google or Line, via NextAuth' })
  @IsString()
  @MinLength(20)
  @MaxLength(4096)
  @Transform(({ value }: { value: string }) => value?.trim())
  idToken: string;

  @ApiPropertyOptional({
    description:
      'Only for a first-time Line sign-in where Line released no address. ' +
      'Ignored when the provider supplied a verified one.',
    example: 'somchai@example.com'
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  @Transform(({ value }: { value: string }) => value?.trim().toLowerCase())
  email?: string;
}

/**
 * AUTH-007 step two for a provider login. The ID token is posted again next to
 * the code, mirroring how the local flow re-posts the password: there is no
 * half-authenticated token in between for anyone to steal.
 */
export class VerifyOAuthDto extends OAuthLoginDto {
  @ApiProperty({ example: '043915', description: 'Six-digit code from email' })
  @IsString()
  @Transform(({ value }: { value: string }) => value?.trim())
  @Matches(/^\d{6}$/, { message: 'otp must be exactly six digits' })
  otp: string;
}

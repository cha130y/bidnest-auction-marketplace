import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** AUTH-004 — carries the opaque refresh token for /refresh and /logout. */
export class RefreshTokenDto {
  @ApiProperty({
    description:
      'The opaque refresh token handed out by /auth/2fa/verify or a previous ' +
      '/auth/refresh. Not a JWT — the server stores only its SHA-256 digest.',
    example: 'K3nS7v...'
  })
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  @Transform(({ value }: { value: string }) => value?.trim())
  refreshToken: string;
}

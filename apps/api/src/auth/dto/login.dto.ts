import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
  MinLength
} from 'class-validator';

/** AUTH-002 step one — credentials only; no token comes back. */
export class LoginDto {
  @ApiProperty({ example: 'somchai@example.com' })
  @IsEmail()
  @MaxLength(320)
  @Transform(({ value }: { value: string }) => value?.trim().toLowerCase())
  email: string;

  @ApiProperty({ example: 'Str0ngPassw0rd' })
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password: string;

  @ApiPropertyOptional({
    description:
      'AUTH-007 — the token apps/web keeps for a browser that has already ' +
      'answered a code. A match lets this login skip straight to the tokens; ' +
      'anything else is ignored and the code is sent as usual.'
  })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9a-f]{64}$/, { message: 'deviceToken is not a valid token' })
  deviceToken?: string;
}

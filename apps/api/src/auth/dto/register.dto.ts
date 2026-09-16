import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength
} from 'class-validator';

/**
 * AUTH-001 — "first name, display name, a unique email and a password are
 * required; last name is optional". Max lengths mirror the column widths
 * in schema.prisma so validation fails before Postgres does.
 */
export class RegisterDto {
  @ApiProperty({ example: 'somchai@example.com', maxLength: 320 })
  @IsEmail()
  @MaxLength(320)
  @Transform(({ value }: { value: string }) => value?.trim().toLowerCase())
  email: string;

  @ApiProperty({ example: 'Str0ngPassw0rd', minLength: 8, maxLength: 72 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'password must contain at least one letter and one number'
  })
  password: string;

  @ApiProperty({ example: 'Somchai', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }: { value: string }) => value?.trim())
  firstName: string;

  @ApiPropertyOptional({ example: 'Jaidee', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }: { value: string }) => value?.trim())
  lastName?: string;

  @ApiProperty({
    example: 'somchai',
    maxLength: 100,
    description: 'Public-facing name shown on auctions and listings (USR-001)'
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }: { value: string }) => value?.trim())
  displayName: string;
}

import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

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
}

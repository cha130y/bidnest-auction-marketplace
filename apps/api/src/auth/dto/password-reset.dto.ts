import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength
} from 'class-validator';

/** AUTH-005 step one — ask for a link. */
export class ForgotPasswordDto {
  @ApiProperty({ example: 'somchai@example.com', maxLength: 320 })
  @IsEmail()
  @MaxLength(320)
  @Transform(({ value }: { value: string }) => value?.trim().toLowerCase())
  email: string;
}

/** AUTH-005 step two — spend the link and set a new password. */
export class ResetPasswordDto {
  @ApiProperty({ description: 'The token from the emailed link' })
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  @Transform(({ value }: { value: string }) => value?.trim())
  token: string;

  @ApiProperty({ example: 'N3wStr0ngPass', minLength: 8, maxLength: 72 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'password must contain at least one letter and one number'
  })
  password: string;
}

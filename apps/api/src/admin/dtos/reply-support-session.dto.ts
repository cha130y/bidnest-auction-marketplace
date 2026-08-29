import { IsString, MaxLength, MinLength } from 'class-validator';

export class ReplySupportSessionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body: string;
}

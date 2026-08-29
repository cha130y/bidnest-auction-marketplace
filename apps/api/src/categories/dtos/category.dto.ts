import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength
} from 'class-validator';

/** ADM-003 — create. `slug` is derived from the name, never sent by the caller. */
export class CreateCategoryDto {
  @ApiProperty({ example: 'เครื่องใช้ไฟฟ้า', maxLength: 120 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @Transform(({ value }: { value: string }) => value?.trim())
  name: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }: { value: string }) => value?.trim())
  description?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Parent category. It must itself be a root and active — the tree is ' +
      'deliberately capped at two levels (ADR-0001).'
  })
  @IsOptional()
  @IsUUID()
  parentId?: string;
}

/** ADM-003 — edit. At least one field has to be present; see the service. */
export class UpdateCategoryDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @Transform(({ value }: { value: string }) => value?.trim())
  name?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }: { value: string }) => value?.trim())
  description?: string;
}

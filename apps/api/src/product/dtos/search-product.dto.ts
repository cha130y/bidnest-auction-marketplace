import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min
} from 'class-validator';
import { ProductSort } from '../constants/product-sort.constant';

export class SearchProductDto {
  @IsString()
  @IsOptional()
  q?: string;

  // Accepts ?categoryIds=a&categoryIds=b and ?categoryIds=a,b
  @IsUUID('4', { each: true })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (Array.isArray(value)) return value as string[];
    if (typeof value === 'string') return value.split(',');
    return value;
  })
  categoryIds?: string[];

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  minPrice?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  maxPrice?: number;

  @IsEnum(ProductSort)
  @IsOptional()
  sort?: ProductSort;

  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  limit?: number;
}

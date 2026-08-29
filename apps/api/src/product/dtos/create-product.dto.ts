import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsNotEmpty,
  IsUUID,
  IsUrl,
  Max,
  Min
} from 'class-validator';
import { ProductCondition } from '../../../generated/prisma/enums';
import { Trim } from '../../common/decorators/trim.decorator';

export class CreateProductDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  title: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  description: string;

  @IsUUID()
  categoryId: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  price: number;

  @IsInt()
  @Min(0)
  stockQty: number;

  @IsEnum(ProductCondition)
  condition: ProductCondition;

  // PROD-001 — at least one image required
  @IsArray()
  @ArrayMinSize(1)
  @IsUrl({}, { each: true })
  imageUrls: string[];

  // PROD-006 — private to the seller, never returned to buyers
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @IsOptional()
  negotiationFloor?: number;

  // PROD-007 — quantity discount rule
  @IsInt()
  @Min(2)
  @IsOptional()
  @Type(() => Number)
  quantityDiscountMinQty?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(100)
  @IsOptional()
  quantityDiscountPercent?: number;
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateIf
} from 'class-validator';

/** Trims, and turns an empty string into null so a field can be cleared. */
const trimOrNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

/**
 * USR-001 — every field is optional: this is a partial update, and sending
 * `null` clears an optional field rather than leaving it as it was.
 *
 * firstName and displayName are the two that cannot be cleared, because
 * public pages fall back to displayName and a profile without one has nothing
 * to show.
 */
export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'สมชาย', maxLength: 100 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }: { value: string }) => value?.trim())
  firstName?: string;

  @ApiPropertyOptional({ example: 'ใจดี', maxLength: 100, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(100)
  @Transform(trimOrNull)
  lastName?: string | null;

  @ApiPropertyOptional({
    example: 'somchai',
    maxLength: 100,
    description: 'The name auctions and listings show publicly'
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }: { value: string }) => value?.trim())
  displayName?: string;

  @ApiPropertyOptional({ format: 'url', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  @Transform(trimOrNull)
  avatarUrl?: string | null;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(500)
  @Transform(trimOrNull)
  bio?: string | null;

  @ApiPropertyOptional({ example: '0812345678', maxLength: 30, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(30)
  @Transform(trimOrNull)
  phone?: string | null;

  /*
   * The five below, with `phone` above them, are the default shipping address.
   *
   * Every `@MaxLength` here is copied from `ShippingAddressDto` rather than
   * chosen — these values exist to be sent to `POST /orders/checkout`, and a
   * profile that accepted a longer city than checkout does would let someone
   * save an address that then fails at the till, with nothing on the profile
   * screen to say why.
   *
   * Prefills the checkout address form (CART-004). The order keeps its own
   * snapshot, so editing these later never rewrites past orders.
   */

  @ApiPropertyOptional({
    example: 'สมชาย ใจดี',
    maxLength: 150,
    nullable: true
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(150)
  @Transform(trimOrNull)
  recipientName?: string | null;

  @ApiPropertyOptional({
    example: '123 ถนนสุขุมวิท',
    maxLength: 200,
    nullable: true
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(200)
  @Transform(trimOrNull)
  line1?: string | null;

  @ApiPropertyOptional({
    example: 'อาคาร A ชั้น 5',
    maxLength: 200,
    nullable: true
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(200)
  @Transform(trimOrNull)
  line2?: string | null;

  @ApiPropertyOptional({
    example: 'กรุงเทพมหานคร',
    maxLength: 100,
    nullable: true
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(100)
  @Transform(trimOrNull)
  city?: string | null;

  @ApiPropertyOptional({ example: '10110', maxLength: 20, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(20)
  @Transform(trimOrNull)
  postalCode?: string | null;
}

import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested
} from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator';
import { PaymentMethod } from '../../payment/types/payment-provider.type';

export class ShippingAddressDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  recipientName: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  line1: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  line2?: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  postalCode: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  phone: string;
}

export class CheckoutDto {
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @IsObject()
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress: ShippingAddressDto;

  /**
   * CART-003 — which cart lines this payment is for. Omitting it pays for the
   * whole cart, which is what every existing caller does and what the route
   * did before selection existed.
   *
   * Cart line ids rather than product ids: the same product can only appear
   * once in a cart, but the line is what carries the quantity and the price
   * that was quoted, and it is the line that gets cleared afterwards.
   */
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  @IsOptional()
  cartItemIds?: string[];

  /**
   * The auction being paid for, when this is a win rather than a cart.
   *
   * Only the id: the price comes from the lot's own `soldPrice`, and who is
   * allowed to pay comes from its `winnerUserId`. Nothing about either is
   * taken from the client, exactly as nothing about a cart's prices is.
   *
   * Mutually exclusive with `cartItemIds` — they name two different things to
   * buy, and a request carrying both has not said which. Refused in the
   * service rather than here, because a cross-field rule reads better where
   * the other side of it lives.
   */
  @IsUUID('4')
  @IsOptional()
  auctionId?: string;
}

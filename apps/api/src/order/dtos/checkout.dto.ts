import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
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
}

import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator';

/**
 * PROD-002 — everything about an uploaded image except the file itself, which
 * arrives as multipart and is handled by the pipe.
 *
 * `altText` is what a screen reader reads out. Optional because a seller who
 * leaves it blank should still be able to upload — the alternative is an empty
 * string pretending to be a description, which is worse for the person relying
 * on it.
 */
export class AddProductImageDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @IsOptional()
  altText?: string;
}

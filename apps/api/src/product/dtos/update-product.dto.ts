import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateProductDto } from './create-product.dto';

/**
 * PROD-002 — every field of a listing is editable, with one deliberate hole in
 * the shape: pictures are not edited here.
 *
 * `imageUrls` used to be accepted and replaced the whole set — every row
 * deleted, new ones written with invented storage keys. The files the old rows
 * pointed at stayed in the store with nothing referencing them: invisible, and
 * never cleaned up. Nothing in the codebase sent the field, so the leak was
 * one request away rather than in use, and a comment on the form was the only
 * thing standing in its way.
 *
 * A picture goes on and comes off through `POST /products/:id/images` and
 * `DELETE /products/:id/images/:imageId`, which upload and delete the file
 * alongside the row. Leaving `imageUrls` out here means a caller that still
 * sends it is told so — `forbidNonWhitelisted` answers 400 and names the field
 * — instead of being quietly obeyed.
 */
export class UpdateProductDto extends PartialType(
  OmitType(CreateProductDto, ['imageUrls'] as const)
) {}

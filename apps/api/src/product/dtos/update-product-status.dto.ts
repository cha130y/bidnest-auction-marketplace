import { IsIn } from 'class-validator';

/**
 * PROD-002 — the seller may only move between the two states they own.
 * OUT_OF_STOCK is derived from stock (PROD-005), REMOVED is terminal and
 * reached through DELETE, and SUSPENDED belongs to the admin (ADM-005).
 */
export class UpdateProductStatusDto {
  @IsIn(['ACTIVE', 'INACTIVE'])
  status: 'ACTIVE' | 'INACTIVE';
}

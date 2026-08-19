import type { ShipmentStatus } from '../../../generated/prisma/enums';

/**
 * SHIP-001 — the sequence is fixed and forward-only. CANCELLED is reachable
 * only while the parcel has not shipped yet; DELIVERED and CANCELLED are final.
 */
export const SHIPMENT_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  PROCESSING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['IN_TRANSIT'],
  IN_TRANSIT: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

export function nextStatuses(from: ShipmentStatus): ShipmentStatus[] {
  return SHIPMENT_TRANSITIONS[from];
}

export function canTransition(
  from: ShipmentStatus,
  to: ShipmentStatus,
): boolean {
  return SHIPMENT_TRANSITIONS[from].includes(to);
}

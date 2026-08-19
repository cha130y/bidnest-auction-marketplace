import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { ShipmentStatus } from '../../generated/prisma/enums';
import { PrismaService } from '../database/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import {
  canTransition,
  nextStatuses,
} from './constants/shipment-transition.constant';
import { generateTracking } from './utils/generate-tracking.util';

type OrderParties = {
  orderId: string;
  buyerId: string;
  sellerId: string;
  shipmentId: string;
  status: ShipmentStatus;
};

@Injectable()
export class ShipmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  /** SHIP-002 — buyer-facing timeline, read straight from shipment_events. */
  async getTimeline(orderId: string, userId: string) {
    const order = await this.loadOrderParties(orderId, userId);

    const shipment = await this.prisma.shipment.findUnique({
      where: { id: order.shipmentId },
      include: {
        events: {
          orderBy: { id: 'asc' },
          select: { eventType: true, createdAt: true },
        },
      },
    });

    if (!shipment) throw new NotFoundException('Shipment not found');

    return {
      orderId,
      status: shipment.status,
      trackingNumber: shipment.trackingNumber,
      carrier: shipment.carrier,
      // SRS 6 — tells the UI to keep the "Test / Simulated" badge visible
      isSimulated: true,
      timeline: shipment.events.map((event) => ({
        status: event.eventType,
        at: event.createdAt,
      })),
      // Lets the seller UI render controls without hardcoding the sequence
      nextStatuses: nextStatuses(shipment.status),
    };
  }

  /** SHIP-001 — only the seller advances the parcel, one fixed step at a time. */
  async updateStatus(orderId: string, userId: string, next: ShipmentStatus) {
    const order = await this.loadOrderParties(orderId, userId);

    if (order.sellerId !== userId) {
      throw new ForbiddenException('Only the seller can update the shipment');
    }

    if (!canTransition(order.status, next)) {
      const allowed = nextStatuses(order.status);
      throw new BadRequestException(
        allowed.length
          ? `Cannot move from ${order.status} to ${next}. Allowed: ${allowed.join(', ')}`
          : `${order.status} is a final status and cannot change`,
      );
    }

    const tracking = next === 'SHIPPED' ? generateTracking() : null;

    const result = await this.prisma.$transaction(async (tx) => {
      // Guarded on the status we validated against, so two sellers clicking at
      // once cannot both advance the parcel (same pattern as stock decrement).
      const { count } = await tx.shipment.updateMany({
        where: { id: order.shipmentId, status: order.status },
        data: {
          status: next,
          ...(tracking ?? {}),
        },
      });

      if (count !== 1) {
        throw new ConflictException(
          'The shipment status changed in the meantime — reload and try again',
        );
      }

      // Read back rather than reporting the local `tracking`, which is only set
      // on the SHIPPED step — later steps must still return the real number.
      const shipment = await tx.shipment.findUniqueOrThrow({
        where: { id: order.shipmentId },
        select: { trackingNumber: true, carrier: true },
      });

      // Append-only, mirroring auction_events. Existing rows are never touched.
      await tx.shipmentEvent.create({
        data: {
          shipmentId: order.shipmentId,
          actorUserId: userId,
          eventType: next,
        },
      });

      if (next === 'CANCELLED') {
        await this.cancelOrder(tx, order.orderId);
      }

      const notifications = this.buildNotifications(order, next);
      await tx.notification.createMany({ data: notifications });

      return { shipment, notifications };
    });

    // Emitted after commit so nobody is told about a rolled-back transition.
    // SRS 5.2 pushes order/shipment status to both sides.
    for (const userIdToNotify of [order.buyerId, order.sellerId]) {
      this.realtime.emitOrderStatusChanged(userIdToNotify, {
        orderId,
        status: next,
        trackingNumber: result.shipment.trackingNumber,
      });
    }

    return {
      orderId,
      status: next,
      trackingNumber: result.shipment.trackingNumber,
      carrier: result.shipment.carrier,
      isSimulated: true,
      nextStatuses: nextStatuses(next),
      notificationsCreated: result.notifications.length,
    };
  }

  /**
   * A parcel cancelled before it ships puts the goods back on the shelf and
   * closes the order. V1 has no refund flow, so the money side is out of scope
   * (SRS 1.2) — the order simply stops being active.
   */
  private async cancelOrder(tx: Prisma.TransactionClient, orderId: string) {
    await tx.order.update({
      where: { id: orderId },
      data: { status: 'CANCELLED' },
    });

    const items = await tx.orderItem.findMany({
      where: { orderId },
      select: { productId: true, quantity: true },
    });

    for (const item of items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stockQty: { increment: item.quantity } },
      });
    }

    // Only a sold-out listing comes back; INACTIVE and REMOVED are deliberate
    // seller/admin states and must survive a restock (same rule as PROD-005).
    await tx.product.updateMany({
      where: {
        id: { in: items.map((item) => item.productId) },
        status: 'OUT_OF_STOCK',
        stockQty: { gt: 0 },
      },
      data: { status: 'ACTIVE' },
    });
  }

  /** NOT-006 on every change, plus a distinct NOT-007 when it lands. */
  private buildNotifications(
    order: OrderParties,
    next: ShipmentStatus,
  ): Prisma.NotificationCreateManyInput[] {
    const rows: Prisma.NotificationCreateManyInput[] = [
      {
        userId: order.buyerId,
        orderId: order.orderId,
        type: 'SHIPMENT_UPDATE',
        title: 'Shipment update',
        message: `Order ${order.orderId} is now ${next}.`,
      },
    ];

    if (next === 'DELIVERED') {
      rows.push({
        userId: order.buyerId,
        orderId: order.orderId,
        type: 'DELIVERED',
        title: 'Order delivered',
        message: `Order ${order.orderId} has been delivered.`,
      });
    }

    return rows;
  }

  private async loadOrderParties(
    orderId: string,
    userId: string,
  ): Promise<OrderParties> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        buyerId: true,
        sellerId: true,
        shipment: { select: { id: true, status: true } },
      },
    });

    // Not-found rather than forbidden: an outsider learns nothing about
    // whether the order exists (SRS 6).
    if (!order || (order.buyerId !== userId && order.sellerId !== userId)) {
      throw new NotFoundException('Order not found');
    }

    if (!order.shipment) {
      throw new NotFoundException('Shipment not found');
    }

    return {
      orderId: order.id,
      buyerId: order.buyerId,
      sellerId: order.sellerId,
      shipmentId: order.shipment.id,
      status: order.shipment.status,
    };
  }
}

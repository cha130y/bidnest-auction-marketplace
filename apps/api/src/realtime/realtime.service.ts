import { Injectable } from '@nestjs/common';
import {
  conversationRoom,
  supportRoom,
  SUPPORT_ADMIN_INBOX_ROOM,
  UserGateway
} from './user.gateway';

/**
 * The push side of SRS 4.1, addressed at one person: notifications, and order
 * and shipment status for the buyer and the seller.
 *
 * This was a stub that only logged, standing in for the WebSocket gateway
 * until it existed. It exists now (UserGateway), so the two user-scoped
 * methods send for real — and, as that stub promised, no call site changed:
 * checkout, shipment and the auction module call exactly what they called
 * before.
 */
@Injectable()
export class RealtimeService {
  constructor(private readonly userGateway: UserGateway) {}

  emitOrderStatusChanged(userId: string, payload: unknown): void {
    this.userGateway.emitToUser(userId, 'order:status_changed', payload);
  }

  emitNotificationCreated(userId: string, payload: unknown): void {
    this.userGateway.emitToUser(userId, 'notification:created', payload);
  }

  /**
   * CHAT-001..003 — the join path this was waiting on now exists
   * (UserGateway#joinConversation), so this delivers for real.
   */
  emitMessageSent(conversationId: string, payload: unknown): void {
    this.userGateway.emitToRoom(
      conversationRoom(conversationId),
      'message:sent',
      payload
    );
  }

  /** A support session's owner and any admin viewing it, both in the same room. */
  emitSupportMessage(sessionId: string, payload: unknown): void {
    this.userGateway.emitToRoom(
      supportRoom(sessionId),
      'support:message',
      payload
    );
  }

  /** Every connected admin — a new escalation, or activity on someone else's thread. */
  emitSupportInboxUpdate(payload: unknown): void {
    this.userGateway.emitToRoom(
      SUPPORT_ADMIN_INBOX_ROOM,
      'support:inbox_updated',
      payload
    );
  }
}

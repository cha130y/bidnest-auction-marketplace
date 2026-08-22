import { Injectable, Logger } from '@nestjs/common';
import { UserGateway } from './user.gateway';

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

  private readonly logger = new Logger(RealtimeService.name);

  emitOrderStatusChanged(userId: string, payload: unknown): void {
    this.userGateway.emitToUser(userId, 'order:status_changed', payload);
  }

  emitNotificationCreated(userId: string, payload: unknown): void {
    this.userGateway.emitToUser(userId, 'notification:created', payload);
  }

  /**
   * Still a stub, and deliberately.
   *
   * A conversation room needs sockets to join it, and who may join which
   * conversation is a rule the chat module owns (CHAT-001..003) — the auction
   * module has no business deciding it. Emitting into a room nobody can join
   * would look finished while delivering nothing, so this keeps logging until
   * whoever owns chat adds the join path.
   */
  emitMessageSent(conversationId: string, payload: unknown): void {
    this.logger.log(
      `[stub] message:sent -> conversation:${conversationId} ${JSON.stringify(payload)}`
    );
  }
}

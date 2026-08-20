import { Injectable, Logger } from '@nestjs/common';

/**
 * TEMPORARY — stands in for Dev 4's WebSocket gateway (SRS §5.2 event contract).
 * Call sites stay unchanged when the real gateway lands; only these method
 * bodies get replaced with `server.to(room).emit(...)`.
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);

  emitOrderStatusChanged(userId: string, payload: unknown): void {
    this.emit('order:status_changed', `user:${userId}`, payload);
  }

  emitNotificationCreated(userId: string, payload: unknown): void {
    this.emit('notification:created', `user:${userId}`, payload);
  }

  emitMessageSent(conversationId: string, payload: unknown): void {
    this.emit('message:sent', `conversation:${conversationId}`, payload);
  }

  private emit(event: string, room: string, payload: unknown): void {
    this.logger.log(`[stub] ${event} -> ${room} ${JSON.stringify(payload)}`);
  }
}

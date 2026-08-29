import { Test } from '@nestjs/testing';
import { RealtimeService } from './realtime.service';
import { conversationRoom, UserGateway } from './user.gateway';

const USER_ID = '00000000-0000-4000-8000-000000000801';
const CONVERSATION_ID = '00000000-0000-4000-8000-000000000901';

/**
 * SRS 5.2 — the events the platform has to emit at one person or one thread.
 * This service was a stub standing in for the gateway; the gateway exists
 * now, and the point of these tests is that the call sites nobody changed
 * reach it.
 */
describe('RealtimeService', () => {
  let service: RealtimeService;
  let userGateway: { emitToUser: jest.Mock; emitToRoom: jest.Mock };

  beforeEach(async () => {
    userGateway = { emitToUser: jest.fn(), emitToRoom: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        RealtimeService,
        { provide: UserGateway, useValue: userGateway }
      ]
    }).compile();

    service = moduleRef.get(RealtimeService);
  });

  it('sends a notification to the person it belongs to', () => {
    service.emitNotificationCreated(USER_ID, { type: 'OUTBID' });

    expect(userGateway.emitToUser).toHaveBeenCalledWith(
      USER_ID,
      'notification:created',
      { type: 'OUTBID' }
    );
  });

  it('sends an order status change to the person it concerns', () => {
    service.emitOrderStatusChanged(USER_ID, { status: 'PAID' });

    expect(userGateway.emitToUser).toHaveBeenCalledWith(
      USER_ID,
      'order:status_changed',
      { status: 'PAID' }
    );
  });

  it('sends a chat message into its thread’s room', () => {
    service.emitMessageSent(CONVERSATION_ID, { body: 'hello' });

    expect(userGateway.emitToRoom).toHaveBeenCalledWith(
      conversationRoom(CONVERSATION_ID),
      'message:sent',
      { body: 'hello' }
    );
  });
});

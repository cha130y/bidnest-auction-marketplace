import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { AdminSupportService } from './support.service';

describe('AdminSupportService', () => {
  const SESSION_ID = '22222222-2222-4222-8222-222222222222';
  const ADMIN_ID = '33333333-3333-4333-8333-333333333333';

  let service: AdminSupportService;
  let prisma: {
    supportChatSession: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    supportChatMessage: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let realtime: {
    emitSupportMessage: jest.Mock;
    emitSupportInboxUpdate: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      supportChatSession: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        update: jest
          .fn()
          .mockImplementation(
            ({ where, data }: { where: { id: string }; data: object }) =>
              Promise.resolve({ id: where.id, ...data })
          )
      },
      supportChatMessage: {
        create: jest
          .fn()
          .mockImplementation(({ data }: { data: object }) =>
            Promise.resolve({ id: 'msg-1', createdAt: new Date(), ...data })
          )
      },
      $transaction: jest
        .fn()
        .mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
          fn(prisma)
        )
    };
    realtime = {
      emitSupportMessage: jest.fn(),
      emitSupportInboxUpdate: jest.fn()
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminSupportService,
        { provide: PrismaService, useValue: prisma },
        { provide: RealtimeService, useValue: realtime }
      ]
    }).compile();

    service = moduleRef.get(AdminSupportService);
  });

  describe('listSessions', () => {
    it('defaults to the open queue (ESCALATED) when no status is given', async () => {
      await service.listSessions();

      expect(prisma.supportChatSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'ESCALATED' } })
      );
    });

    it('flattens the user/admin profile down to id/email/displayName', async () => {
      prisma.supportChatSession.findMany.mockResolvedValue([
        {
          id: SESSION_ID,
          status: 'ESCALATED',
          user: {
            id: 'user-1',
            email: 'buyer@bidnest.test',
            profile: { displayName: 'Anan B.' }
          },
          assignedAdmin: null,
          messages: [{ id: 'm1', body: 'สวัสดี' }]
        }
      ]);

      const [result] = await service.listSessions();

      expect(result.user).toEqual({
        id: 'user-1',
        email: 'buyer@bidnest.test',
        displayName: 'Anan B.'
      });
      expect(result.assignedAdmin).toBeNull();
      expect(result.lastMessage).toEqual({ id: 'm1', body: 'สวัสดี' });
    });
  });

  describe('getSession', () => {
    it('404s on a session that does not exist', async () => {
      prisma.supportChatSession.findUnique.mockResolvedValue(null);

      await expect(service.getSession(SESSION_ID)).rejects.toBeInstanceOf(
        NotFoundException
      );
    });
  });

  describe('claim', () => {
    it('assigns the calling admin and notifies the inbox', async () => {
      prisma.supportChatSession.findUnique.mockResolvedValue({
        id: SESSION_ID
      });

      await service.claim(SESSION_ID, ADMIN_ID);

      expect(prisma.supportChatSession.update).toHaveBeenCalledWith({
        where: { id: SESSION_ID },
        data: { assignedAdminId: ADMIN_ID }
      });
      expect(realtime.emitSupportInboxUpdate).toHaveBeenCalled();
    });

    it('404s on a session that does not exist', async () => {
      prisma.supportChatSession.findUnique.mockResolvedValue(null);

      await expect(service.claim(SESSION_ID, ADMIN_ID)).rejects.toBeInstanceOf(
        NotFoundException
      );
    });
  });

  describe('reply', () => {
    it('auto-claims an unclaimed session and creates an ADMIN message', async () => {
      prisma.supportChatSession.findUnique.mockResolvedValue({
        id: SESSION_ID,
        assignedAdminId: null
      });

      const message = await service.reply(SESSION_ID, ADMIN_ID, 'สวัสดีครับ');

      expect(prisma.supportChatSession.update).toHaveBeenCalledWith({
        where: { id: SESSION_ID },
        data: { status: 'ESCALATED', assignedAdminId: ADMIN_ID }
      });
      expect(message).toMatchObject({ role: 'ADMIN', body: 'สวัสดีครับ' });
      expect(realtime.emitSupportMessage).toHaveBeenCalledWith(
        SESSION_ID,
        expect.objectContaining({ role: 'ADMIN' })
      );
    });

    it('keeps the already-assigned admin rather than reassigning to whoever replies', async () => {
      prisma.supportChatSession.findUnique.mockResolvedValue({
        id: SESSION_ID,
        assignedAdminId: 'some-other-admin'
      });

      await service.reply(SESSION_ID, ADMIN_ID, 'สวัสดีครับ');

      expect(prisma.supportChatSession.update).toHaveBeenCalledWith({
        where: { id: SESSION_ID },
        data: { status: 'ESCALATED', assignedAdminId: 'some-other-admin' }
      });
    });

    it('reopens a RESOLVED session back to ESCALATED', async () => {
      prisma.supportChatSession.findUnique.mockResolvedValue({
        id: SESSION_ID,
        assignedAdminId: ADMIN_ID,
        status: 'RESOLVED'
      });

      await service.reply(SESSION_ID, ADMIN_ID, 'ยังอยู่ไหมครับ');

      expect(prisma.supportChatSession.update).toHaveBeenCalledWith({
        where: { id: SESSION_ID },
        data: { status: 'ESCALATED', assignedAdminId: ADMIN_ID }
      });
    });
  });

  describe('resolve', () => {
    it('sets status to RESOLVED', async () => {
      prisma.supportChatSession.findUnique.mockResolvedValue({
        id: SESSION_ID
      });

      const result = await service.resolve(SESSION_ID);

      expect(prisma.supportChatSession.update).toHaveBeenCalledWith({
        where: { id: SESSION_ID },
        data: { status: 'RESOLVED' }
      });
      expect(result.status).toBe('RESOLVED');
    });
  });
});

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { GeminiClientService } from '../ai-tools/gemini-client.service';
import { PromptBuilderService } from '../ai-tools/prompt-builder.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { GeminiUnavailableException } from '../ai-tools/exceptions/gemini-unavailable.exception';
import { FAQ_KNOWLEDGE_BASE } from '../ai-tools/faq-knowledge-base';
import { SupportChatService } from './support-chat.service';

const FALLBACK = 'ยังไม่มีข้อมูลเรื่องนี้ แนะนำให้ติดต่อแอดมินเพิ่มเติม';
const EXHAUSTED =
  'ผมลองช่วยเต็มที่แล้วในส่วนนี้ครับ ถ้ายังไม่หายแนะนำให้ติดต่อแอดมินเพื่อช่วยตรวจสอบให้ละเอียดขึ้นครับ';

describe('SupportChatService', () => {
  const USER_ID = '11111111-1111-4111-8111-111111111111';
  const SESSION_ID = '22222222-2222-4222-8222-222222222222';

  let service: SupportChatService;
  let prisma: {
    supportChatSession: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    supportChatMessage: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let geminiClient: { generateReply: jest.Mock };
  let promptBuilder: { buildSupportPrompt: jest.Mock };
  let realtime: {
    emitSupportMessage: jest.Mock;
    emitSupportInboxUpdate: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      supportChatSession: {
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({
          id: SESSION_ID,
          userId: USER_ID,
          status: 'AI_ONLY'
        }),
        update: jest
          .fn()
          .mockImplementation(
            ({ where, data }: { where: { id: string }; data: object }) =>
              Promise.resolve({ id: where.id, userId: USER_ID, ...data })
          )
      },
      supportChatMessage: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'msg-1', createdAt: new Date(), ...data })
          )
      },
      $transaction: jest
        .fn()
        .mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
          fn(prisma)
        )
    };
    geminiClient = {
      generateReply: jest.fn().mockResolvedValue('คำตอบจาก AI')
    };
    promptBuilder = {
      buildSupportPrompt: jest.fn().mockReturnValue('a prompt')
    };
    realtime = {
      emitSupportMessage: jest.fn(),
      emitSupportInboxUpdate: jest.fn()
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SupportChatService,
        { provide: PrismaService, useValue: prisma },
        { provide: GeminiClientService, useValue: geminiClient },
        { provide: PromptBuilderService, useValue: promptBuilder },
        { provide: RealtimeService, useValue: realtime }
      ]
    }).compile();

    service = moduleRef.get(SupportChatService);
  });

  describe('a guest caller (no userId)', () => {
    it('answers without touching the database', async () => {
      const result = await service.sendMessage(undefined, 'สวัสดี');

      expect(prisma.supportChatSession.create).not.toHaveBeenCalled();
      expect(prisma.supportChatMessage.create).not.toHaveBeenCalled();
      expect(result.sessionId).toBeNull();
      expect(result.reply.sessionId).toBeNull();
      expect(result.reply.body).toBe('คำตอบจาก AI');
    });

    it('builds the prompt from the history the browser sent, not the database', async () => {
      const history = [{ role: 'USER' as const, body: 'คำถามก่อนหน้า' }];

      await service.sendMessage(undefined, 'คำถามใหม่', undefined, history);

      expect(promptBuilder.buildSupportPrompt).toHaveBeenCalledWith(
        history,
        'คำถามใหม่'
      );
    });

    it('treats a missing history as empty rather than throwing', async () => {
      await expect(
        service.sendMessage(undefined, 'สวัสดี', undefined, undefined)
      ).resolves.toBeDefined();

      expect(promptBuilder.buildSupportPrompt).toHaveBeenCalledWith(
        [],
        'สวัสดี'
      );
    });

    it('escalates once its own last two turns plus this reply all missed the FAQ', async () => {
      geminiClient.generateReply.mockResolvedValue(FALLBACK);
      const history = [
        { role: 'USER' as const, body: 'q1' },
        { role: 'ASSISTANT' as const, body: FALLBACK },
        { role: 'USER' as const, body: 'q2' },
        { role: 'ASSISTANT' as const, body: FALLBACK }
      ];

      const result = await service.sendMessage(
        undefined,
        'q3',
        undefined,
        history
      );

      expect(result.escalated).toBe(true);
    });

    it('does not escalate on a single miss', async () => {
      geminiClient.generateReply.mockResolvedValue(FALLBACK);

      const result = await service.sendMessage(undefined, 'q1');

      expect(result.escalated).toBe(false);
    });

    it('escalates immediately when asked for a human outright, without calling the AI', async () => {
      const result = await service.sendMessage(
        undefined,
        'ขอติดต่อแอดมินหน่อยครับ'
      );

      expect(geminiClient.generateReply).not.toHaveBeenCalled();
      expect(result.escalated).toBe(true);
    });

    it('recognizes a mixed-language ask for admin, not just the exact phrases on the fixed list', async () => {
      const result = await service.sendMessage(
        undefined,
        'ติดต่อ admin หน่อยครับ'
      );

      expect(geminiClient.generateReply).not.toHaveBeenCalled();
      expect(result.escalated).toBe(true);
    });

    it('does not treat every mention of the word "แอดมิน" as a request to escalate', async () => {
      geminiClient.generateReply.mockResolvedValue(FALLBACK);

      const result = await service.sendMessage(
        undefined,
        'แอดมินคนก่อนตอบไม่ตรงคำถามที่ผมถามไปเลย'
      );

      expect(geminiClient.generateReply).toHaveBeenCalled();
      expect(result.escalated).toBe(false);
    });

    it('escalates on the spot once the AI signals it has already done everything it can', async () => {
      geminiClient.generateReply.mockResolvedValue(EXHAUSTED);

      const result = await service.sendMessage(undefined, 'ยังไม่หายเลยครับ');

      expect(result.escalated).toBe(true);
    });

    // Every real FAQ question must actually reach the AI rather than get
    // short-circuited by the keyword check — this is the "answerable
    // questions must be answered" requirement, checked against the live FAQ
    // list rather than a hand-picked sample so a future FAQ edit gets
    // re-verified automatically.
    describe.each(FAQ_KNOWLEDGE_BASE.map((entry) => entry.question))(
      'FAQ question: "%s"',
      (question) => {
        it('reaches the AI instead of the canned admin reply', async () => {
          geminiClient.generateReply.mockResolvedValue('คำตอบจาก AI');

          const result = await service.sendMessage(undefined, question);

          expect(geminiClient.generateReply).toHaveBeenCalled();
          expect(result.reply.body).not.toBe(
            'ได้เลยครับ กดปุ่ม "คุยกับแอดมิน" ด้านล่างเพื่อติดต่อทีมงานได้เลยครับ'
          );
        });
      }
    );

    // Same requirement, but for realistic sentences that mention an admin or
    // "คุย" in passing while asking about something else entirely — these are
    // the shapes that broke the very first (presence-anywhere) version of the
    // keyword check.
    describe.each([
      'แอดมินจะเห็นข้อความในแชทที่ผมคุยกับผู้ขายไหม',
      'ถ้าผู้ขายไม่ตอบแชท แอดมินช่วยดูให้ได้ไหมคะ',
      'เจ้าหน้าที่จัดส่งเอาของมาส่งกี่โมงคะ',
      'มีเจ้าหน้าที่คอยตรวจสอบสินค้าก่อนขายไหม',
      'คนขายกับคนซื้อคุยกันได้ที่ไหน'
    ])(
      'a question that mentions an admin/staff/chat word in passing: "%s"',
      (question) => {
        it('still reaches the AI instead of the canned admin reply', async () => {
          geminiClient.generateReply.mockResolvedValue('คำตอบจาก AI');

          await service.sendMessage(undefined, question);

          expect(geminiClient.generateReply).toHaveBeenCalled();
        });
      }
    );

    // The other side of the same requirement: real ways a frustrated user
    // asks for a human, including phrasing not on the old fixed-phrase list.
    describe.each([
      'ติดต่อแอดมินหน่อยครับ',
      'คุยกับแอดมิน',
      'ขอคุยกับแอดมินหน่อย',
      'อยากคุยกับแอดมิน',
      'ติดต่อ admin หน่อยครับ',
      'contact admin please',
      'talk to a human',
      'ขอคุยกับเจ้าหน้าที่ได้ไหม',
      'พูดคุยกับเจ้าหน้าที่หน่อยค่ะ',
      'ขอสายแอดมินหน่อย',
      'แอดมิน',
      'admin'
    ])('an explicit ask for a human: "%s"', (message) => {
      it('escalates immediately without calling the AI', async () => {
        const result = await service.sendMessage(undefined, message);

        expect(geminiClient.generateReply).not.toHaveBeenCalled();
        expect(result.escalated).toBe(true);
      });
    });

    it('falls back to a friendly reply and offers the admin button when Gemini itself is unavailable', async () => {
      geminiClient.generateReply.mockRejectedValue(
        new GeminiUnavailableException()
      );

      const result = await service.sendMessage(undefined, 'สวัสดี');

      expect(result.escalated).toBe(true);
      expect(result.reply.body).not.toMatch(/undefined|error|Error/);
    });
  });

  describe('a signed-in caller', () => {
    it('starts a new session when no sessionId is given', async () => {
      const result = await service.sendMessage(USER_ID, 'สวัสดี');

      expect(prisma.supportChatSession.create).toHaveBeenCalledWith({
        data: { userId: USER_ID }
      });
      expect(result.sessionId).toBe(SESSION_ID);
    });

    it('reuses an existing session it owns', async () => {
      prisma.supportChatSession.findUnique.mockResolvedValue({
        id: SESSION_ID,
        userId: USER_ID,
        status: 'AI_ONLY'
      });

      await service.sendMessage(USER_ID, 'สวัสดี', SESSION_ID);

      expect(prisma.supportChatSession.create).not.toHaveBeenCalled();
    });

    it('refuses to keep talking to the AI once the session has moved to an admin', async () => {
      prisma.supportChatSession.findUnique.mockResolvedValue({
        id: SESSION_ID,
        userId: USER_ID,
        status: 'ESCALATED'
      });

      await expect(
        service.sendMessage(USER_ID, 'สวัสดี', SESSION_ID)
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('404s on a session that does not exist', async () => {
      prisma.supportChatSession.findUnique.mockResolvedValue(null);

      await expect(
        service.sendMessage(USER_ID, 'สวัสดี', SESSION_ID)
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('escalates immediately when asked for a human outright, without calling the AI', async () => {
      const result = await service.sendMessage(
        USER_ID,
        'ขอคุยกับแอดมินหน่อยครับ'
      );

      expect(geminiClient.generateReply).not.toHaveBeenCalled();
      expect(result.escalated).toBe(true);
      const calls = prisma.supportChatMessage.create.mock.calls as [
        { data: { role: string; body: string } }
      ][];
      expect(calls.map((call) => call[0].data)).toContainEqual(
        expect.objectContaining({ role: 'ASSISTANT' })
      );
    });

    it('refuses a session that belongs to somebody else', async () => {
      prisma.supportChatSession.findUnique.mockResolvedValue({
        id: SESSION_ID,
        userId: 'someone-else'
      });

      await expect(
        service.sendMessage(USER_ID, 'สวัสดี', SESSION_ID)
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('persists both the user turn and the reply', async () => {
      await service.sendMessage(USER_ID, 'สวัสดี');

      const calls = prisma.supportChatMessage.create.mock.calls as [
        { data: { role: string; body: string } }
      ][];
      const bodies = calls.map((call) => call[0].data);
      expect(bodies).toContainEqual(
        expect.objectContaining({ role: 'USER', body: 'สวัสดี' })
      );
      expect(bodies).toContainEqual(
        expect.objectContaining({ role: 'ASSISTANT', body: 'คำตอบจาก AI' })
      );
    });

    it('escalates once the last three persisted replies all missed the FAQ', async () => {
      prisma.supportChatMessage.findMany.mockResolvedValue([
        { body: FALLBACK },
        { body: FALLBACK },
        { body: FALLBACK }
      ]);
      geminiClient.generateReply.mockResolvedValue(FALLBACK);

      const result = await service.sendMessage(USER_ID, 'สวัสดี');

      expect(result.escalated).toBe(true);
    });

    it('escalates on the spot once the AI signals it has already done everything it can, without waiting for three misses', async () => {
      prisma.supportChatMessage.findMany.mockResolvedValue([
        { body: EXHAUSTED }
      ]);
      geminiClient.generateReply.mockResolvedValue(EXHAUSTED);

      const result = await service.sendMessage(USER_ID, 'ยังไม่หายเลยครับ');

      expect(result.escalated).toBe(true);
    });
  });

  describe('getHistory', () => {
    it('reads the owned session’s messages in order, alongside its status', async () => {
      prisma.supportChatSession.findUnique.mockResolvedValue({
        id: SESSION_ID,
        userId: USER_ID,
        status: 'ESCALATED'
      });

      const result = await service.getHistory(SESSION_ID, USER_ID);

      expect(prisma.supportChatMessage.findMany).toHaveBeenCalledWith({
        where: { sessionId: SESSION_ID },
        orderBy: { createdAt: 'asc' }
      });
      expect(result.status).toBe('ESCALATED');
    });

    it('refuses a session that belongs to somebody else', async () => {
      prisma.supportChatSession.findUnique.mockResolvedValue({
        id: SESSION_ID,
        userId: 'someone-else'
      });

      await expect(
        service.getHistory(SESSION_ID, USER_ID)
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('escalate', () => {
    it('refuses when the AI has not actually failed three times running', async () => {
      prisma.supportChatSession.findUnique.mockResolvedValue({
        id: SESSION_ID,
        userId: USER_ID,
        status: 'AI_ONLY'
      });
      prisma.supportChatMessage.findMany.mockResolvedValue([]);

      await expect(
        service.escalate(SESSION_ID, USER_ID)
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.supportChatSession.update).not.toHaveBeenCalled();
    });

    it('escalates when the last message asked for a human outright, even with no AI misses', async () => {
      prisma.supportChatSession.findUnique.mockResolvedValue({
        id: SESSION_ID,
        userId: USER_ID,
        status: 'AI_ONLY'
      });
      prisma.supportChatMessage.findMany.mockResolvedValue([]);
      prisma.supportChatMessage.findFirst.mockResolvedValue({
        role: 'USER',
        body: 'อยากคุยกับแอดมิน'
      });

      await service.escalate(SESSION_ID, USER_ID);

      expect(prisma.supportChatSession.update).toHaveBeenCalledWith({
        where: { id: SESSION_ID },
        data: { status: 'ESCALATED' }
      });
    });

    it('escalates once the heuristic is re-checked and holds server-side', async () => {
      prisma.supportChatSession.findUnique.mockResolvedValue({
        id: SESSION_ID,
        userId: USER_ID,
        status: 'AI_ONLY'
      });
      prisma.supportChatMessage.findMany.mockResolvedValue([
        { body: FALLBACK },
        { body: FALLBACK },
        { body: FALLBACK }
      ]);

      const result = await service.escalate(SESSION_ID, USER_ID);

      expect(prisma.supportChatSession.update).toHaveBeenCalledWith({
        where: { id: SESSION_ID },
        data: { status: 'ESCALATED' }
      });
      expect(realtime.emitSupportInboxUpdate).toHaveBeenCalled();
      expect(result.status).toBe('ESCALATED');
    });

    it('is idempotent once already escalated', async () => {
      prisma.supportChatSession.findUnique.mockResolvedValue({
        id: SESSION_ID,
        userId: USER_ID,
        status: 'ESCALATED'
      });

      const result = await service.escalate(SESSION_ID, USER_ID);

      expect(prisma.supportChatSession.update).not.toHaveBeenCalled();
      expect(result.status).toBe('ESCALATED');
    });

    it('refuses a session that belongs to somebody else', async () => {
      prisma.supportChatSession.findUnique.mockResolvedValue({
        id: SESSION_ID,
        userId: 'someone-else',
        status: 'AI_ONLY'
      });

      await expect(
        service.escalate(SESSION_ID, USER_ID)
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('sendUserMessageToAdmin', () => {
    it('persists the message with no AI call and notifies over the realtime channel', async () => {
      prisma.supportChatSession.findUnique.mockResolvedValue({
        id: SESSION_ID,
        userId: USER_ID,
        status: 'ESCALATED'
      });

      const message = await service.sendUserMessageToAdmin(
        SESSION_ID,
        USER_ID,
        'ยังไม่ได้รับพัสดุเลยครับ'
      );

      expect(geminiClient.generateReply).not.toHaveBeenCalled();
      expect(message).toMatchObject({
        sessionId: SESSION_ID,
        role: 'USER',
        body: 'ยังไม่ได้รับพัสดุเลยครับ'
      });
      expect(realtime.emitSupportMessage).toHaveBeenCalledWith(
        SESSION_ID,
        expect.objectContaining({ body: 'ยังไม่ได้รับพัสดุเลยครับ' })
      );
      expect(realtime.emitSupportInboxUpdate).toHaveBeenCalled();
    });

    it('refuses a session that belongs to somebody else', async () => {
      prisma.supportChatSession.findUnique.mockResolvedValue({
        id: SESSION_ID,
        userId: 'someone-else',
        status: 'ESCALATED'
      });

      await expect(
        service.sendUserMessageToAdmin(SESSION_ID, USER_ID, 'ข้อความ')
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('reopens a RESOLVED session back to ESCALATED so it resurfaces in the admin queue', async () => {
      prisma.supportChatSession.findUnique.mockResolvedValue({
        id: SESSION_ID,
        userId: USER_ID,
        status: 'RESOLVED'
      });

      await service.sendUserMessageToAdmin(
        SESSION_ID,
        USER_ID,
        'ยังไม่หายเลยครับ'
      );

      expect(prisma.supportChatSession.update).toHaveBeenCalledWith({
        where: { id: SESSION_ID },
        data: { status: 'ESCALATED' }
      });
    });
  });
});

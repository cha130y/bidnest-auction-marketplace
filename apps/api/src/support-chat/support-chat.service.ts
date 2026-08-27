import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiClientService } from '../ai-tools/gemini-client.service';
import {
  ChatHistoryItem,
  PromptBuilderService
} from '../ai-tools/prompt-builder.service';
import { RealtimeService } from '../realtime/realtime.service';
import { ChatRole, SupportSessionStatus } from '../../generated/prisma/enums';
import { ChatMessageDto, SendMessageResponseDto } from './dto/chat-message.dto';

const ESCALATION_THRESHOLD = 3;
const FALLBACK_MARKER = 'ยังไม่มีข้อมูลเรื่องนี้';

@Injectable()
export class SupportChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geminiClient: GeminiClientService,
    private readonly promptBuilder: PromptBuilderService,
    private readonly realtime: RealtimeService
  ) {}

  async getHistory(
    sessionId: string,
    userId: string
  ): Promise<ChatMessageDto[]> {
    await this.getOwnedSession(sessionId, userId);

    return this.prisma.supportChatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' }
    });
  }

  /**
   * AI-001 — `userId` is `undefined` for a guest (the route is `@Public()`).
   * A guest gets a real answer but nothing persisted: `SupportChatSession`
   * requires a `userId` (see schema.prisma), and inventing an anonymous
   * account for a one-off question would be a bigger change than the
   * requirement — "answer without logging in" — actually calls for.
   * Continuity across a guest's own turns comes from `history`, which their
   * own browser already holds and resends; the server only carries history
   * across turns once there is an account to own a session row.
   */
  async sendMessage(
    userId: string | undefined,
    message: string,
    sessionId?: string,
    guestHistory?: ChatHistoryItem[]
  ): Promise<SendMessageResponseDto> {
    if (!userId) return this.sendGuestMessage(message, guestHistory ?? []);

    const session = sessionId
      ? await this.getOwnedSession(sessionId, userId)
      : await this.prisma.supportChatSession.create({ data: { userId } });

    if (session.status !== SupportSessionStatus.AI_ONLY) {
      throw new BadRequestException(
        'บทสนทนานี้ย้ายไปคุยกับแอดมินแล้ว ใช้ endpoint ส่งข้อความถึงแอดมินแทน'
      );
    }

    await this.prisma.supportChatMessage.create({
      data: { sessionId: session.id, role: ChatRole.USER, body: message }
    });

    const history = await this.prisma.supportChatMessage.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: 'asc' }
    });

    const prompt = this.promptBuilder.buildSupportPrompt(
      history.map((item) => ({ role: item.role, body: item.body })),
      message
    );

    const replyText = await this.geminiClient.generateReply(prompt);

    const replyMessage = await this.prisma.supportChatMessage.create({
      data: { sessionId: session.id, role: ChatRole.ASSISTANT, body: replyText }
    });

    return {
      sessionId: session.id,
      reply: replyMessage,
      escalated: await this.isSessionEscalated(session.id)
    };
  }

  /**
   * User-triggered — the "คุยกับแอดมิน" button, shown only once the AI has
   * already failed. Re-checks the escalation heuristic server-side rather
   * than trusting the client's own `escalated` flag, so a session can't be
   * pushed into an admin's queue by an unearned button click.
   *
   * Idempotent once escalated (or resolved): a double-click, or the button
   * still being visible from a stale render, just returns the current state
   * instead of erroring.
   */
  async escalate(sessionId: string, userId: string) {
    const session = await this.getOwnedSession(sessionId, userId);

    if (session.status !== SupportSessionStatus.AI_ONLY) return session;

    if (!(await this.isSessionEscalated(sessionId))) {
      throw new BadRequestException('ยังไม่ถึงจุดที่ต้องคุยกับแอดมิน');
    }

    const updated = await this.prisma.supportChatSession.update({
      where: { id: sessionId },
      data: { status: SupportSessionStatus.ESCALATED }
    });

    this.realtime.emitSupportInboxUpdate({ sessionId, userId });

    return updated;
  }

  /**
   * A message into an already-escalated session — no Gemini call, this goes
   * straight to whichever admin is watching (or the next one to open the
   * queue). `sendMessage` above is the AI turn; this is the human one.
   */
  async sendUserMessageToAdmin(
    sessionId: string,
    userId: string,
    body: string
  ): Promise<ChatMessageDto> {
    await this.getOwnedSession(sessionId, userId);

    const message = await this.prisma.supportChatMessage.create({
      data: { sessionId, role: ChatRole.USER, body }
    });

    this.realtime.emitSupportMessage(sessionId, message);
    this.realtime.emitSupportInboxUpdate({ sessionId, userId });

    return message;
  }

  private async sendGuestMessage(
    message: string,
    guestHistory: ChatHistoryItem[]
  ): Promise<SendMessageResponseDto> {
    const prompt = this.promptBuilder.buildSupportPrompt(guestHistory, message);
    const replyText = await this.geminiClient.generateReply(prompt);

    const priorAssistantBodies = guestHistory
      .filter((item) => item.role === ChatRole.ASSISTANT)
      .map((item) => item.body)
      .slice(-(ESCALATION_THRESHOLD - 1));

    return {
      sessionId: null,
      reply: {
        id: randomUUID(),
        sessionId: null,
        role: ChatRole.ASSISTANT,
        body: replyText,
        createdAt: new Date()
      },
      escalated: this.isEscalated([...priorAssistantBodies, replyText])
    };
  }

  private async getOwnedSession(sessionId: string, userId: string) {
    const session = await this.prisma.supportChatSession.findUnique({
      where: { id: sessionId }
    });

    if (!session) {
      throw new NotFoundException('ไม่พบบทสนทนานี้');
    }
    if (session.userId !== userId) {
      throw new ForbiddenException('คุณไม่มีสิทธิ์เข้าถึงบทสนทนานี้');
    }

    return session;
  }

  private async isSessionEscalated(sessionId: string): Promise<boolean> {
    const recentAssistantMessages =
      await this.prisma.supportChatMessage.findMany({
        where: { sessionId, role: ChatRole.ASSISTANT },
        orderBy: { createdAt: 'desc' },
        take: ESCALATION_THRESHOLD
      });

    return this.isEscalated(recentAssistantMessages.map((item) => item.body));
  }

  /**
   * True once the last `ESCALATION_THRESHOLD` assistant replies (oldest or
   * newest first, order doesn't matter here) all missed the FAQ — shared by
   * the persisted path, which reads them back from the database, and the
   * guest path, which only ever has the ones its own browser sent up.
   */
  private isEscalated(recentAssistantBodies: string[]): boolean {
    return (
      recentAssistantBodies.length === ESCALATION_THRESHOLD &&
      recentAssistantBodies.every((body) => body.includes(FALLBACK_MARKER))
    );
  }
}

import {
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
import { ChatRole } from '../../generated/prisma/enums';
import { ChatMessageDto, SendMessageResponseDto } from './dto/chat-message.dto';

const ESCALATION_THRESHOLD = 3;
const FALLBACK_MARKER = 'ยังไม่มีข้อมูลเรื่องนี้';

@Injectable()
export class SupportChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geminiClient: GeminiClientService,
    private readonly promptBuilder: PromptBuilderService
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

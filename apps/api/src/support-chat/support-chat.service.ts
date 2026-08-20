import {
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiClientService } from '../ai-tools/gemini-client.service';
import { PromptBuilderService } from '../ai-tools/prompt-builder.service';
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

  async sendMessage(
    userId: string,
    message: string,
    sessionId?: string
  ): Promise<SendMessageResponseDto> {
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

    return (
      recentAssistantMessages.length === ESCALATION_THRESHOLD &&
      recentAssistantMessages.every((item) =>
        item.body.includes(FALLBACK_MARKER)
      )
    );
  }
}

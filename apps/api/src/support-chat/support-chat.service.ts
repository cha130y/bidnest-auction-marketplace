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
import { GeminiUnavailableException } from '../ai-tools/exceptions/gemini-unavailable.exception';
import {
  ChatMessageDto,
  GetHistoryResponseDto,
  SendMessageResponseDto
} from './dto/chat-message.dto';

const ESCALATION_THRESHOLD = 3;
const FALLBACK_MARKER = 'ยังไม่มีข้อมูลเรื่องนี้';

/**
 * Set by prompt rule 3 (prompt-builder.service.ts) when the AI has already
 * walked the user through everything the FAQ covers and it still isn't
 * resolved — distinct from FALLBACK_MARKER (topic never matched the FAQ at
 * all), so it escalates on its own turn instead of waiting for
 * ESCALATION_THRESHOLD repeats. A miss on an unrelated question shouldn't
 * fast-track a button that "I already gave you my best shot" earns instantly.
 */
const EXHAUSTED_MARKER = 'ผมลองช่วยเต็มที่แล้ว';

/**
 * Shown in place of a real AI reply when Gemini itself is unavailable
 * (quota, outage, timeout) — reuses EXHAUSTED_MARKER so the "คุยกับแอดมิน"
 * button appears immediately rather than the caller seeing a raw 503 with
 * nothing to do about it.
 */
const GEMINI_DOWN_REPLY = `ตอนนี้ผู้ช่วย AI มีคนใช้งานเยอะชั่วคราวครับ ${EXHAUSTED_MARKER}ในส่วนนี้ครับ แนะนำให้ติดต่อแอดมินได้เลยครับ`;

const CONTACT_ADMIN_REPLY =
  'ได้เลยครับ กดปุ่ม "คุยกับแอดมิน" ด้านล่างเพื่อติดต่อทีมงานได้เลยครับ';

/**
 * A contact-intent verb within a few characters of an "admin"/"a human"
 * noun, checked as one combined pattern rather than "both words appear
 * somewhere in the message" — that looser check (the previous approach) is
 * too eager: "แอดมินจะเห็นข้อความที่ผมคุยกับผู้ขายไหม" contains both "แอดมิน"
 * and "คุย" but is a real FAQ-answerable privacy question, not a request for
 * a human, because "คุย" there belongs to "คุยกับผู้ขาย", nowhere near
 * "แอดมิน". Requiring the two words to actually sit next to each other (a
 * short character gap, to absorb connectors like "กับ"/"หน่อย") is what
 * keeps mixed-language phrasing like "ติดต่อ admin" catchable without also
 * catching unrelated sentences that merely mention the word "แอดมิน".
 */
const ADMIN_NOUN = '(?:แอดมิน|admin|เจ้าหน้าที่|คนจริง|human agent|human)';
const CONTACT_VERB = '(?:ติดต่อ|พูดคุย|คุย|ขอสาย|call|talk|speak|contact)';
const PROXIMITY_GAP = '.{0,8}';
const NEAR_ADMIN_REQUEST_PATTERN = new RegExp(
  `${CONTACT_VERB}${PROXIMITY_GAP}${ADMIN_NOUN}|${ADMIN_NOUN}${PROXIMITY_GAP}${CONTACT_VERB}`,
  'i'
);
const ADMIN_NOUN_PATTERN = new RegExp(ADMIN_NOUN, 'i');
const SHORT_MESSAGE_THRESHOLD = 8;

function isExplicitEscalationRequest(message: string): boolean {
  const normalized = message.trim();
  if (NEAR_ADMIN_REQUEST_PATTERN.test(normalized)) return true;

  // A lone mention with barely anything else around it ("แอดมิน", "admin
  // ครับ") still counts even with no verb attached — a frustrated user often
  // just types the word itself. Checked on the whole remaining message (not
  // just what trails the word) so a long, unrelated sentence that happens to
  // mention "แอดมิน" once doesn't qualify as "just the word".
  if (!ADMIN_NOUN_PATTERN.test(normalized)) return false;
  const withoutAdminNoun = normalized.replace(ADMIN_NOUN_PATTERN, '').trim();
  return withoutAdminNoun.length <= SHORT_MESSAGE_THRESHOLD;
}

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
  ): Promise<GetHistoryResponseDto> {
    const session = await this.getOwnedSession(sessionId, userId);

    const messages = await this.prisma.supportChatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' }
    });

    return { status: session.status, messages };
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

    if (isExplicitEscalationRequest(message)) {
      const replyMessage = await this.prisma.supportChatMessage.create({
        data: {
          sessionId: session.id,
          role: ChatRole.ASSISTANT,
          body: CONTACT_ADMIN_REPLY
        }
      });

      return { sessionId: session.id, reply: replyMessage, escalated: true };
    }

    const history = await this.prisma.supportChatMessage.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: 'asc' }
    });

    const prompt = this.promptBuilder.buildSupportPrompt(
      history.map((item) => ({ role: item.role, body: item.body })),
      message
    );

    const replyText = await this.generateReplySafely(prompt);

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
   *
   * Also reopens a RESOLVED session back to ESCALATED, mirroring
   * `AdminSupportService#reply`'s reopen-on-reply behaviour — otherwise a
   * user messaging a closed case never surfaces in the admin's default
   * (ESCALATED-only) queue, and nothing would ever prompt an admin to reply
   * and trigger that reopen from their side.
   */
  async sendUserMessageToAdmin(
    sessionId: string,
    userId: string,
    body: string
  ): Promise<ChatMessageDto> {
    const session = await this.getOwnedSession(sessionId, userId);

    const message = await this.prisma.$transaction(async (tx) => {
      if (session.status === SupportSessionStatus.RESOLVED) {
        await tx.supportChatSession.update({
          where: { id: sessionId },
          data: { status: SupportSessionStatus.ESCALATED }
        });
      }

      return tx.supportChatMessage.create({
        data: { sessionId, role: ChatRole.USER, body }
      });
    });

    this.realtime.emitSupportMessage(sessionId, message);
    this.realtime.emitSupportInboxUpdate({ sessionId, userId });

    return message;
  }

  private async sendGuestMessage(
    message: string,
    guestHistory: ChatHistoryItem[]
  ): Promise<SendMessageResponseDto> {
    if (isExplicitEscalationRequest(message)) {
      return {
        sessionId: null,
        reply: {
          id: randomUUID(),
          sessionId: null,
          role: ChatRole.ASSISTANT,
          body: CONTACT_ADMIN_REPLY,
          createdAt: new Date()
        },
        escalated: true
      };
    }

    const prompt = this.promptBuilder.buildSupportPrompt(guestHistory, message);
    const replyText = await this.generateReplySafely(prompt);

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
      escalated:
        replyText.includes(EXHAUSTED_MARKER) ||
        this.isEscalated([...priorAssistantBodies, replyText])
    };
  }

  /**
   * Gemini being down (quota, outage, timeout) shouldn't surface as a raw
   * 503 mid-demo — reply with the same "I've done what I can" message an
   * exhausted AI would give, so the caller gets the "คุยกับแอดมิน" button
   * instead of a dead end.
   */
  private async generateReplySafely(prompt: string): Promise<string> {
    try {
      return await this.geminiClient.generateReply(prompt);
    } catch (error) {
      if (error instanceof GeminiUnavailableException) {
        return GEMINI_DOWN_REPLY;
      }
      throw error;
    }
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

  /**
   * True on either path to "คุยกับแอดมิน": the 3-miss heuristic below, or
   * the caller having just asked for a human outright — checked here too
   * (not just in sendMessage) since escalate() re-validates server-side
   * rather than trusting the client's own flag from that earlier response.
   */
  private async isSessionEscalated(sessionId: string): Promise<boolean> {
    const recentAssistantMessages =
      await this.prisma.supportChatMessage.findMany({
        where: { sessionId, role: ChatRole.ASSISTANT },
        orderBy: { createdAt: 'desc' },
        take: ESCALATION_THRESHOLD
      });

    if (recentAssistantMessages[0]?.body.includes(EXHAUSTED_MARKER)) {
      return true;
    }

    if (this.isEscalated(recentAssistantMessages.map((item) => item.body))) {
      return true;
    }

    const lastUserMessage = await this.prisma.supportChatMessage.findFirst({
      where: { sessionId, role: ChatRole.USER },
      orderBy: { createdAt: 'desc' }
    });

    return (
      !!lastUserMessage && isExplicitEscalationRequest(lastUserMessage.body)
    );
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

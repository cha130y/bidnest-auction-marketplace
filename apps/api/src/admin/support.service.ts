import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { ChatRole, SupportSessionStatus } from '../../generated/prisma/enums';
import { ListAdminSupportSessionsDto } from './dtos/list-admin-support-sessions.dto';

const PARTICIPANT_SELECT = {
  id: true,
  email: true,
  profile: { select: { displayName: true } }
} as const;

function flattenParticipant(
  participant: {
    id: string;
    email: string;
    profile: { displayName: string } | null;
  } | null
) {
  return participant
    ? {
        id: participant.id,
        email: participant.email,
        displayName: participant.profile?.displayName ?? null
      }
    : null;
}

/**
 * The admin side of the AI-001 escalation flow — a queue of sessions a human
 * has been asked to join, and the reply/claim/resolve actions on one of them.
 * `SupportChatService` (support-chat module) owns the user-facing half:
 * the AI turns, and the escalate button that puts a session in this queue.
 */
@Injectable()
export class AdminSupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService
  ) {}

  async listSessions(query: ListAdminSupportSessionsDto = {}) {
    const status = query.status ?? SupportSessionStatus.ESCALATED;

    const sessions = await this.prisma.supportChatSession.findMany({
      where: { status },
      include: {
        user: { select: PARTICIPANT_SELECT },
        assignedAdmin: { select: PARTICIPANT_SELECT },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 }
      },
      orderBy: { createdAt: 'asc' }
    });

    return sessions.map(({ user, assignedAdmin, messages, ...session }) => ({
      ...session,
      user: flattenParticipant(user),
      assignedAdmin: flattenParticipant(assignedAdmin),
      lastMessage: messages[0] ?? null
    }));
  }

  async getSession(sessionId: string) {
    const session = await this.prisma.supportChatSession.findUnique({
      where: { id: sessionId },
      include: {
        user: { select: PARTICIPANT_SELECT },
        assignedAdmin: { select: PARTICIPANT_SELECT },
        messages: { orderBy: { createdAt: 'asc' } }
      }
    });

    if (!session) throw new NotFoundException('ไม่พบบทสนทนานี้');

    const { user, assignedAdmin, ...rest } = session;
    return {
      ...rest,
      user: flattenParticipant(user),
      assignedAdmin: flattenParticipant(assignedAdmin)
    };
  }

  async claim(sessionId: string, adminId: string) {
    await this.requireSession(sessionId);

    const updated = await this.prisma.supportChatSession.update({
      where: { id: sessionId },
      data: { assignedAdminId: adminId }
    });

    this.realtime.emitSupportInboxUpdate({ sessionId });

    return updated;
  }

  /**
   * Auto-claims an unclaimed session to whoever replies first, and reopens a
   * RESOLVED one — a reply is exactly the signal that this is active again.
   */
  async reply(sessionId: string, adminId: string, body: string) {
    const session = await this.requireSession(sessionId);

    const message = await this.prisma.$transaction(async (tx) => {
      await tx.supportChatSession.update({
        where: { id: sessionId },
        data: {
          status: SupportSessionStatus.ESCALATED,
          assignedAdminId: session.assignedAdminId ?? adminId
        }
      });

      return tx.supportChatMessage.create({
        data: { sessionId, role: ChatRole.ADMIN, body }
      });
    });

    this.realtime.emitSupportMessage(sessionId, message);
    this.realtime.emitSupportInboxUpdate({ sessionId });

    return message;
  }

  async resolve(sessionId: string) {
    await this.requireSession(sessionId);

    const updated = await this.prisma.supportChatSession.update({
      where: { id: sessionId },
      data: { status: SupportSessionStatus.RESOLVED }
    });

    this.realtime.emitSupportInboxUpdate({ sessionId });

    return updated;
  }

  private async requireSession(sessionId: string) {
    const session = await this.prisma.supportChatSession.findUnique({
      where: { id: sessionId }
    });

    if (!session) throw new NotFoundException('ไม่พบบทสนทนานี้');

    return session;
  }
}

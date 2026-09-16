import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ListAdminActionsDto } from './dtos/list-admin-actions.dto';

/**
 * ADM-004 — Audit log viewer (owner: Dev 5)
 *
 * Read-only — there must be no method that edits or deletes `admin_actions`,
 * because that would make the audit trail untrustworthy (SRS §6 requires
 * logging security-relevant Admin actions).
 *
 * `admin_actions` already has indexes `[adminUserId, createdAt]` and
 * `[actionType, createdAt]` — the cursor-based pagination below uses them
 * through orderBy createdAt
 */
@Injectable()
export class AdminActionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Takes the DTO itself rather than a private copy of its shape, so the
   * bounds written there cannot drift from what this method assumes. Every
   * field arrives validated: the controller is the only caller.
   */
  async listActions(query: ListAdminActionsDto = {}) {
    const limit = query.limit ?? 20;

    return this.prisma.adminAction.findMany({
      where: query.actionType ? { actionType: query.actionType } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {})
    });
  }
}

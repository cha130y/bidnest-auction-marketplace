import type { Prisma } from '../../../generated/prisma/client';
import type { ProductCondition } from '../../../generated/prisma/enums';

/**
 * AUC-002 — one acceptance rule the draft has not met yet. `field` names the
 * DTO field the seller edits (`scheduledEndAt`), not the column it lands in
 * (`originalEndAt`), so the frontend can point straight at the input.
 */
export const DraftIssueCode = {
  TITLE_REQUIRED: 'TITLE_REQUIRED',
  DESCRIPTION_REQUIRED: 'DESCRIPTION_REQUIRED',
  CONDITION_REQUIRED: 'CONDITION_REQUIRED',
  CATEGORY_REQUIRED: 'CATEGORY_REQUIRED',
  CATEGORY_INACTIVE: 'CATEGORY_INACTIVE',
  STARTING_PRICE_NOT_POSITIVE: 'STARTING_PRICE_NOT_POSITIVE',
  MIN_BID_INCREMENT_NOT_POSITIVE: 'MIN_BID_INCREMENT_NOT_POSITIVE',
  START_AT_REQUIRED: 'START_AT_REQUIRED',
  END_AT_REQUIRED: 'END_AT_REQUIRED',
  END_AT_NOT_AFTER_START_AT: 'END_AT_NOT_AFTER_START_AT',
  IMAGES_REQUIRED: 'IMAGES_REQUIRED',
  RESERVE_NOT_POSITIVE: 'RESERVE_NOT_POSITIVE',
  RESERVE_BELOW_STARTING_PRICE: 'RESERVE_BELOW_STARTING_PRICE'
} as const;

export type DraftIssueCode =
  (typeof DraftIssueCode)[keyof typeof DraftIssueCode];

export type DraftIssue = {
  field: string;
  code: DraftIssueCode;
  message: string;
};

/** The slice of a draft the publish gate measures — nothing else is read. */
export type DraftForPublish = {
  title: string;
  description: string;
  condition: ProductCondition | null;
  category: { isActive: boolean } | null;
  startingPrice: Prisma.Decimal;
  minBidIncrement: Prisma.Decimal;
  reservePrice: Prisma.Decimal | null;
  scheduledStartAt: Date | null;
  originalEndAt: Date | null;
  images: { id: string }[];
};

/**
 * AUC-002 — the gate a draft must pass before AUC-004 may publish it. It
 * collects every unmet rule instead of throwing on the first one, so the seller
 * sees the whole list in one round trip rather than fixing the draft one error
 * at a time.
 *
 * The rules re-check fields the create DTO already validated: AUC-006 will let
 * a seller edit a draft after creation, and publish — not create — is the last
 * point where the whole draft is looked at as a unit.
 */
export function validateDraftForPublish(draft: DraftForPublish): DraftIssue[] {
  const issues: DraftIssue[] = [];
  const fail = (field: string, code: DraftIssueCode, message: string) => {
    issues.push({ field, code, message });
  };

  // Required text and classification
  if (!draft.title.trim()) {
    fail('title', DraftIssueCode.TITLE_REQUIRED, 'Title is required');
  }
  if (!draft.description.trim()) {
    fail(
      'description',
      DraftIssueCode.DESCRIPTION_REQUIRED,
      'Description is required'
    );
  }
  if (!draft.condition) {
    fail(
      'condition',
      DraftIssueCode.CONDITION_REQUIRED,
      'Item condition is required'
    );
  }

  // ADR-0001 — the category must still be one an admin has left active, which
  // it may have stopped being between saving the draft and publishing it.
  if (!draft.category) {
    fail(
      'categoryId',
      DraftIssueCode.CATEGORY_REQUIRED,
      'Category is required'
    );
  } else if (!draft.category.isActive) {
    fail(
      'categoryId',
      DraftIssueCode.CATEGORY_INACTIVE,
      'Category is not active'
    );
  }

  // Every amount must be greater than zero
  if (draft.startingPrice.lte(0)) {
    fail(
      'startingPrice',
      DraftIssueCode.STARTING_PRICE_NOT_POSITIVE,
      'Starting price must be greater than 0'
    );
  }
  if (draft.minBidIncrement.lte(0)) {
    fail(
      'minBidIncrement',
      DraftIssueCode.MIN_BID_INCREMENT_NOT_POSITIVE,
      'Minimum bid increment must be greater than 0'
    );
  }

  // Schedule: both ends required, and the end must fall after the start
  if (!draft.scheduledStartAt) {
    fail(
      'scheduledStartAt',
      DraftIssueCode.START_AT_REQUIRED,
      'Start time is required'
    );
  }
  if (!draft.originalEndAt) {
    fail(
      'scheduledEndAt',
      DraftIssueCode.END_AT_REQUIRED,
      'End time is required'
    );
  }
  if (
    draft.scheduledStartAt &&
    draft.originalEndAt &&
    draft.originalEndAt.getTime() <= draft.scheduledStartAt.getTime()
  ) {
    fail(
      'scheduledEndAt',
      DraftIssueCode.END_AT_NOT_AFTER_START_AT,
      'End time must be after the start time'
    );
  }

  if (draft.images.length === 0) {
    fail(
      'imageUrls',
      DraftIssueCode.IMAGES_REQUIRED,
      'At least one image is required'
    );
  }

  // AUC-003 — the reserve stays private, but the rule that binds it to the
  // starting price is still enforced here before the draft can go live.
  if (draft.reservePrice !== null) {
    if (draft.reservePrice.lte(0)) {
      fail(
        'reservePrice',
        DraftIssueCode.RESERVE_NOT_POSITIVE,
        'Reserve price must be greater than 0'
      );
    } else if (draft.reservePrice.lt(draft.startingPrice)) {
      fail(
        'reservePrice',
        DraftIssueCode.RESERVE_BELOW_STARTING_PRICE,
        'Reserve price must be at least the starting price'
      );
    }
  }

  return issues;
}

import { Prisma } from '../../../generated/prisma/client';
import {
  DraftForPublish,
  DraftIssueCode,
  validateDraftForPublish
} from './validate-draft-for-publish.util';

const dec = (value: string | number) => new Prisma.Decimal(value);

const START_AT = new Date('2026-09-01T10:00:00.000Z');
const END_AT = new Date('2026-09-01T12:00:00.000Z');

// A fixed "now" before both, so the schedule rules are judged against a clock
// the test controls rather than the machine's.
const NOW = new Date('2026-08-20T09:00:00.000Z');

/** A draft that meets every AUC-002 rule; each test breaks exactly one. */
const publishableDraft = (
  overrides: Partial<DraftForPublish> = {}
): DraftForPublish => ({
  title: 'Vintage Seiko 5 Automatic',
  description: 'Serviced last year, original bracelet.',
  condition: 'USED',
  category: { isActive: true },
  startingPrice: dec(3000),
  minBidIncrement: dec(100),
  reservePrice: dec(4500),
  scheduledStartAt: START_AT,
  originalEndAt: END_AT,
  images: [{ id: 'image-1' }],
  ...overrides
});

const codesOf = (draft: DraftForPublish) =>
  validateDraftForPublish(draft, NOW).map((issue) => issue.code);

describe('validateDraftForPublish (AUC-002)', () => {
  it('passes a draft that meets every rule', () => {
    expect(validateDraftForPublish(publishableDraft(), NOW)).toEqual([]);
  });

  it('passes a draft with no reserve at all — the reserve is optional', () => {
    expect(
      validateDraftForPublish(publishableDraft({ reservePrice: null }), NOW)
    ).toEqual([]);
  });

  describe('required fields', () => {
    it('flags a missing title, including one that is only whitespace', () => {
      expect(codesOf(publishableDraft({ title: '   ' }))).toContain(
        DraftIssueCode.TITLE_REQUIRED
      );
    });

    it('flags a missing description', () => {
      expect(codesOf(publishableDraft({ description: '' }))).toContain(
        DraftIssueCode.DESCRIPTION_REQUIRED
      );
    });

    it('flags a missing condition', () => {
      expect(codesOf(publishableDraft({ condition: null }))).toContain(
        DraftIssueCode.CONDITION_REQUIRED
      );
    });

    it('flags a missing category', () => {
      expect(codesOf(publishableDraft({ category: null }))).toContain(
        DraftIssueCode.CATEGORY_REQUIRED
      );
    });

    // ADR-0001 — a category may be deactivated after the draft was saved
    it('flags a category an admin has deactivated since the draft was saved', () => {
      expect(
        codesOf(publishableDraft({ category: { isActive: false } }))
      ).toContain(DraftIssueCode.CATEGORY_INACTIVE);
    });

    it('flags a missing start time', () => {
      expect(codesOf(publishableDraft({ scheduledStartAt: null }))).toContain(
        DraftIssueCode.START_AT_REQUIRED
      );
    });

    it('flags a missing end time', () => {
      expect(codesOf(publishableDraft({ originalEndAt: null }))).toContain(
        DraftIssueCode.END_AT_REQUIRED
      );
    });
  });

  describe('amounts must be greater than zero', () => {
    it('flags a starting price of zero', () => {
      expect(codesOf(publishableDraft({ startingPrice: dec(0) }))).toContain(
        DraftIssueCode.STARTING_PRICE_NOT_POSITIVE
      );
    });

    it('flags a negative starting price', () => {
      expect(codesOf(publishableDraft({ startingPrice: dec(-1) }))).toContain(
        DraftIssueCode.STARTING_PRICE_NOT_POSITIVE
      );
    });

    it('flags an increment of zero', () => {
      expect(codesOf(publishableDraft({ minBidIncrement: dec(0) }))).toContain(
        DraftIssueCode.MIN_BID_INCREMENT_NOT_POSITIVE
      );
    });

    it('flags a reserve of zero', () => {
      expect(codesOf(publishableDraft({ reservePrice: dec(0) }))).toContain(
        DraftIssueCode.RESERVE_NOT_POSITIVE
      );
    });
  });

  describe('the end time must fall after the start time', () => {
    it('flags an end time before the start time', () => {
      expect(
        codesOf(
          publishableDraft({
            scheduledStartAt: END_AT,
            originalEndAt: START_AT
          })
        )
      ).toContain(DraftIssueCode.END_AT_NOT_AFTER_START_AT);
    });

    it('flags an end time equal to the start time', () => {
      expect(
        codesOf(publishableDraft({ originalEndAt: new Date(START_AT) }))
      ).toContain(DraftIssueCode.END_AT_NOT_AFTER_START_AT);
    });

    // AUC-004 — publishing a draft whose end time has gone by would open an
    // auction that is already over
    it('flags an end time that has already passed', () => {
      const codes = codesOf(
        publishableDraft({
          scheduledStartAt: new Date('2026-08-01T10:00:00.000Z'),
          originalEndAt: new Date('2026-08-01T12:00:00.000Z')
        })
      );

      expect(codes).toContain(DraftIssueCode.END_AT_IN_THE_PAST);
      // the two times are still in the right order relative to each other
      expect(codes).not.toContain(DraftIssueCode.END_AT_NOT_AFTER_START_AT);
    });

    it('accepts a start time in the past as long as the end is still ahead', () => {
      const issues = validateDraftForPublish(
        publishableDraft({
          scheduledStartAt: new Date('2026-08-20T08:00:00.000Z'),
          originalEndAt: new Date('2026-08-20T18:00:00.000Z')
        }),
        NOW
      );

      // that is simply an auction meant to run right now (AUC-004)
      expect(issues).toEqual([]);
    });

    it('treats an end time exactly at now as already passed', () => {
      const codes = codesOf(publishableDraft({ originalEndAt: new Date(NOW) }));

      expect(codes).toContain(DraftIssueCode.END_AT_IN_THE_PAST);
    });

    it('does not add the ordering issue when one end is missing anyway', () => {
      const codes = codesOf(publishableDraft({ scheduledStartAt: null }));

      expect(codes).toContain(DraftIssueCode.START_AT_REQUIRED);
      expect(codes).not.toContain(DraftIssueCode.END_AT_NOT_AFTER_START_AT);
    });
  });

  describe('at least one image', () => {
    it('flags a draft with no images', () => {
      expect(codesOf(publishableDraft({ images: [] }))).toContain(
        DraftIssueCode.IMAGES_REQUIRED
      );
    });

    it('accepts a single image', () => {
      expect(
        validateDraftForPublish(
          publishableDraft({ images: [{ id: 'only' }] }),
          NOW
        )
      ).toEqual([]);
    });
  });

  describe('the reserve must be at least the starting price', () => {
    it('flags a reserve below the starting price', () => {
      expect(
        codesOf(
          publishableDraft({
            startingPrice: dec(3000),
            reservePrice: dec(2999)
          })
        )
      ).toContain(DraftIssueCode.RESERVE_BELOW_STARTING_PRICE);
    });

    it('accepts a reserve equal to the starting price', () => {
      expect(
        validateDraftForPublish(
          publishableDraft({
            startingPrice: dec(3000),
            reservePrice: dec(3000)
          }),
          NOW
        )
      ).toEqual([]);
    });

    it('compares by value, not by string, across decimal places', () => {
      expect(
        validateDraftForPublish(
          publishableDraft({
            startingPrice: dec('3000.00'),
            reservePrice: dec('3000.000')
          }),
          NOW
        )
      ).toEqual([]);
    });
  });

  it('reports every unmet rule at once rather than stopping at the first', () => {
    const codes = codesOf(
      publishableDraft({
        title: '  ',
        startingPrice: dec(0),
        scheduledStartAt: null,
        originalEndAt: null,
        images: [],
        reservePrice: dec(-5)
      })
    );

    expect(codes).toEqual(
      expect.arrayContaining([
        DraftIssueCode.TITLE_REQUIRED,
        DraftIssueCode.STARTING_PRICE_NOT_POSITIVE,
        DraftIssueCode.START_AT_REQUIRED,
        DraftIssueCode.END_AT_REQUIRED,
        DraftIssueCode.IMAGES_REQUIRED,
        DraftIssueCode.RESERVE_NOT_POSITIVE
      ])
    );
  });

  it('points each issue at the field the seller edits', () => {
    const issues = validateDraftForPublish(
      publishableDraft({ originalEndAt: null }),
      NOW
    );

    // the column is originalEndAt, but the seller's form field is scheduledEndAt
    expect(issues).toHaveLength(1);
    expect(issues[0].field).toBe('scheduledEndAt');
    expect(issues[0].code).toBe(DraftIssueCode.END_AT_REQUIRED);
    expect(issues[0].message.length).toBeGreaterThan(0);
  });
});

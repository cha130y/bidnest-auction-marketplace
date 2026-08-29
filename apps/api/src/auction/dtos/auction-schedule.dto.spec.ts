// Nest loads this at bootstrap; a unit test importing a DTO on its own has to
// bring it itself, or `@Type(() => Date)` has no metadata to read.
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateAuctionDraftDto } from './create-auction-draft.dto';
import { UpdateAuctionDto } from './update-auction.dto';

const CATEGORY_ID = '00000000-0000-4000-8000-000000000101';

const isoFromNow = (ms: number) => new Date(Date.now() + ms).toISOString();

const AN_HOUR = 60 * 60 * 1000;

const draft = (schedule: Record<string, string>) => ({
  title: 'Vintage Seiko 5 Automatic',
  description: 'Serviced last year, original bracelet.',
  categoryId: CATEGORY_ID,
  condition: 'USED',
  startingPrice: 3000,
  minBidIncrement: 100,
  ...schedule
});

const failedFields = async (
  Dto: typeof CreateAuctionDraftDto | typeof UpdateAuctionDto,
  payload: object
) => {
  const errors = await validate(plainToInstance(Dto, payload));
  return errors
    .filter((error) => 'isNotInThePast' in (error.constraints ?? {}))
    .map((error) => error.property);
};

/**
 * AUC-001 / AUC-006 — the schedule is refused as it is written, not only at the
 * publish gate. Both DTOs are covered because `UpdateAuctionDto` inherits the
 * rule through `PartialType`, and inheritance is exactly the kind of thing that
 * quietly stops holding.
 */
describe('Auction schedule — no writing into the past', () => {
  it('accepts a schedule still to come', async () => {
    await expect(
      failedFields(
        CreateAuctionDraftDto,
        draft({
          scheduledStartAt: isoFromNow(AN_HOUR),
          scheduledEndAt: isoFromNow(3 * AN_HOUR)
        })
      )
    ).resolves.toEqual([]);
  });

  it('rejects a start that has gone by', async () => {
    await expect(
      failedFields(
        CreateAuctionDraftDto,
        draft({
          scheduledStartAt: isoFromNow(-24 * AN_HOUR),
          scheduledEndAt: isoFromNow(AN_HOUR)
        })
      )
    ).resolves.toEqual(['scheduledStartAt']);
  });

  it('rejects an end that has gone by', async () => {
    await expect(
      failedFields(
        CreateAuctionDraftDto,
        draft({
          scheduledStartAt: isoFromNow(AN_HOUR),
          scheduledEndAt: isoFromNow(-AN_HOUR)
        })
      )
    ).resolves.toEqual(['scheduledEndAt']);
  });

  // Both at once, so a seller fixing one is not sent back for the other
  it('reports both ends when both have gone by', async () => {
    await expect(
      failedFields(
        CreateAuctionDraftDto,
        draft({
          scheduledStartAt: isoFromNow(-3 * AN_HOUR),
          scheduledEndAt: isoFromNow(-AN_HOUR)
        })
      )
    ).resolves.toEqual(['scheduledStartAt', 'scheduledEndAt']);
  });

  it('holds an edit to the same rule', async () => {
    await expect(
      failedFields(UpdateAuctionDto, {
        scheduledStartAt: isoFromNow(-24 * AN_HOUR)
      })
    ).resolves.toEqual(['scheduledStartAt']);
  });

  /**
   * A draft saved last week may hold a schedule that has since gone by. Editing
   * its title must not be refused over a field the seller never sent — the
   * publish gate is what stops that draft from going live unfixed.
   */
  it('says nothing about a schedule an edit does not touch', async () => {
    await expect(
      failedFields(UpdateAuctionDto, { title: 'A better title' })
    ).resolves.toEqual([]);
  });
});

import { findAuctionAudience } from './find-auction-audience.util';

const AUCTION_ID = '00000000-0000-4000-8000-000000000301';
const ALICE = '00000000-0000-4000-8000-00000000000a';
const BOB = '00000000-0000-4000-8000-00000000000b';
const CAROL = '00000000-0000-4000-8000-00000000000c';

type Tx = Parameters<typeof findAuctionAudience>[0];

describe('findAuctionAudience (NOT-003 / NOT-004)', () => {
  const tx = (bidders: string[], watchers: string[]) =>
    ({
      bid: {
        findMany: jest
          .fn()
          .mockResolvedValue(bidders.map((bidderId) => ({ bidderId })))
      },
      watchlist: {
        findMany: jest
          .fn()
          .mockResolvedValue(watchers.map((userId) => ({ userId })))
      }
    }) as unknown as Tx;

  it('gathers everybody who bid and everybody who watched', async () => {
    const audience = await findAuctionAudience(tx([ALICE], [BOB]), AUCTION_ID);

    expect(audience.sort()).toEqual([ALICE, BOB].sort());
  });

  // somebody who did both is still one person
  it('names a person once, however many ways they are involved', async () => {
    const audience = await findAuctionAudience(
      tx([ALICE, ALICE], [ALICE]),
      AUCTION_ID
    );

    expect(audience).toEqual([ALICE]);
  });

  it('leaves out whoever the caller excludes', async () => {
    const audience = await findAuctionAudience(
      tx([ALICE, BOB], [CAROL]),
      AUCTION_ID,
      [BOB]
    );

    expect(audience.sort()).toEqual([ALICE, CAROL].sort());
  });

  // the winner and the seller are passed in, and either can be absent
  it('ignores null and undefined among the exclusions', async () => {
    const audience = await findAuctionAudience(tx([ALICE], []), AUCTION_ID, [
      null,
      undefined
    ]);

    expect(audience).toEqual([ALICE]);
  });

  it('is empty when nobody bid and nobody watched', async () => {
    expect(await findAuctionAudience(tx([], []), AUCTION_ID)).toEqual([]);
  });

  // one bidder can have many bids, and should not be counted per bid
  it('asks the database for distinct bidders rather than every bid', async () => {
    const findBids = jest.fn().mockResolvedValue([{ bidderId: ALICE }]);
    const client = {
      bid: { findMany: findBids },
      watchlist: { findMany: jest.fn().mockResolvedValue([]) }
    } as unknown as Tx;

    await findAuctionAudience(client, AUCTION_ID);

    expect(findBids).toHaveBeenCalledWith(
      expect.objectContaining({ distinct: ['bidderId'] })
    );
  });
});

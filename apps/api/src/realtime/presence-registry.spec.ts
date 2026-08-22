import { PresenceRegistry } from './presence-registry';

const AUCTION = '00000000-0000-4000-8000-000000000301';
const OTHER_AUCTION = '00000000-0000-4000-8000-000000000302';
const ALICE = '00000000-0000-4000-8000-00000000000a';
const BOB = '00000000-0000-4000-8000-00000000000b';

/**
 * LIV-001 — the link between a socket and the person holding it, so a dropped
 * connection can mark somebody absent. The whole point is the counting: one
 * person with two tabs is still one person.
 */
describe('PresenceRegistry', () => {
  let registry: PresenceRegistry;

  beforeEach(() => {
    registry = new PresenceRegistry();
  });

  describe('one socket, one auction', () => {
    it('reports the person gone when their only socket goes', () => {
      registry.register('socket-1', AUCTION, ALICE);

      expect(registry.releaseSocket('socket-1')).toEqual([
        { auctionId: AUCTION, userId: ALICE }
      ]);
    });

    it('reports them gone when they leave the room explicitly', () => {
      registry.register('socket-1', AUCTION, ALICE);

      expect(registry.unregister('socket-1', AUCTION)).toBe(true);
    });

    // a client that rejoins a room it is already in must not double-count
    it('counts a repeated register once', () => {
      registry.register('socket-1', AUCTION, ALICE);
      registry.register('socket-1', AUCTION, ALICE);

      expect(registry.unregister('socket-1', AUCTION)).toBe(true);
    });
  });

  describe('two tabs', () => {
    // closing one tab is not leaving
    it('keeps the person present while another socket holds the auction', () => {
      registry.register('socket-1', AUCTION, ALICE);
      registry.register('socket-2', AUCTION, ALICE);

      expect(registry.releaseSocket('socket-1')).toEqual([]);
    });

    it('reports them gone once the last one closes', () => {
      registry.register('socket-1', AUCTION, ALICE);
      registry.register('socket-2', AUCTION, ALICE);
      registry.releaseSocket('socket-1');

      expect(registry.releaseSocket('socket-2')).toEqual([
        { auctionId: AUCTION, userId: ALICE }
      ]);
    });
  });

  describe('one socket watching several auctions', () => {
    it('releases every auction it was holding', () => {
      registry.register('socket-1', AUCTION, ALICE);
      registry.register('socket-1', OTHER_AUCTION, ALICE);

      expect(registry.releaseSocket('socket-1').sort()).toEqual(
        [
          { auctionId: AUCTION, userId: ALICE },
          { auctionId: OTHER_AUCTION, userId: ALICE }
        ].sort()
      );
    });

    it('leaving one room leaves the other alone', () => {
      registry.register('socket-1', AUCTION, ALICE);
      registry.register('socket-1', OTHER_AUCTION, ALICE);

      registry.unregister('socket-1', AUCTION);

      expect(registry.releaseSocket('socket-1')).toEqual([
        { auctionId: OTHER_AUCTION, userId: ALICE }
      ]);
    });
  });

  describe('different people in the same auction', () => {
    it('counts them apart', () => {
      registry.register('socket-1', AUCTION, ALICE);
      registry.register('socket-2', AUCTION, BOB);

      expect(registry.releaseSocket('socket-1')).toEqual([
        { auctionId: AUCTION, userId: ALICE }
      ]);
      expect(registry.releaseSocket('socket-2')).toEqual([
        { auctionId: AUCTION, userId: BOB }
      ]);
    });
  });

  describe('things that never happened', () => {
    // an anonymous socket was never registered, and disconnects all the time
    it('releases an unknown socket without complaint', () => {
      expect(registry.releaseSocket('never-seen')).toEqual([]);
    });

    it('unregisters an auction the socket was not in', () => {
      registry.register('socket-1', AUCTION, ALICE);

      expect(registry.unregister('socket-1', OTHER_AUCTION)).toBe(false);
    });

    // a socket that already disconnected, then somehow does again
    it('does not report a person gone twice', () => {
      registry.register('socket-1', AUCTION, ALICE);
      registry.releaseSocket('socket-1');

      expect(registry.releaseSocket('socket-1')).toEqual([]);
    });
  });
});

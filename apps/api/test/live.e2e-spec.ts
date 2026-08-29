import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';
import { AuctionLifecycleService } from './../src/auction/auction-lifecycle.service';
import { AuctionGateway } from './../src/realtime/auction.gateway';
import { PrismaService } from './../src/prisma/prisma.service';
import { authRegistry } from './helpers/auth';
import { expectNoReserve } from './helpers/reserve';
import { backdateSchedule } from './helpers/schedule';

/**
 * LIV-001 — the lobby before an auction starts, end to end: the auction on
 * show, how many people are in it, the countdown, whether the person looking
 * has joined, and the auction opening by itself when its time arrives.
 */
describe('Live lobby (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let lifecycle: AuctionLifecycleService;
  let broadcasts: jest.SpyInstance;

  // Unique per run so repeated local runs never collide on the unique indexes.
  const run = Date.now();

  /**
   * Titles carry the run too, not just the emails and slugs. An auction row
   * that outlives its suite — a timeout skips afterAll — is otherwise
   * indistinguishable from real data, and cleaning one up means matching a
   * title that every run of every suite shares.
   */
  const auctionTitle = `Vintage Seiko 5 Automatic ${run}`;
  const draftTitle = `Unpublished draft ${run}`;
  const sellerEmail = `live-seller-${run}@example.com`;
  const buyerEmail = `live-buyer-${run}@example.com`;
  const strangerEmail = `live-stranger-${run}@example.com`;
  const adminEmail = `live-admin-${run}@example.com`;

  let sellerId: string;
  let buyerId: string;
  let strangerId: string;
  let adminId: string;
  let categoryId: string;
  let authOf: (userId: string) => string;

  const hoursFromNow = (hours: number) =>
    new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

  const createUser = async (email: string, role: 'USER' | 'ADMIN') => {
    const user = await prisma.user.create({
      data: {
        email,
        role,
        status: 'ACTIVE',
        profile: { create: { firstName: 'E2E', displayName: `e2e-${email}` } }
      },
      select: { id: true }
    });
    return user.id;
  };

  /**
   * Creates a draft and publishes it, returning its id.
   *
   * A negative `startInHours` asks for an auction that is already running. The
   * draft is still written with a schedule in the future, because AUC-001
   * refuses one that is not, and is then aged into place — which is what
   * really happens to an auction whose start time arrives.
   */
  const publishAuction = async (startInHours: number) => {
    const writable = Math.max(startInHours, 1);

    const created = await request(app.getHttpServer())
      .post('/auctions/drafts')
      .set('Authorization', authOf(sellerId))
      .send({
        title: auctionTitle,
        description: 'Serviced last year, original bracelet.',
        categoryId,
        condition: 'USED',
        startingPrice: 3000,
        minBidIncrement: 100,
        reservePrice: 4500,
        scheduledStartAt: hoursFromNow(writable),
        scheduledEndAt: hoursFromNow(writable + 4),
        imageUrls: ['https://placehold.co/600x400?text=Front']
      })
      .expect(201);

    const id = (created.body as { id: string }).id;

    if (startInHours < 0) {
      await backdateSchedule(prisma, id, {
        startAt: new Date(hoursFromNow(startInHours)),
        endAt: new Date(hoursFromNow(startInHours + 4))
      });
    }

    await request(app.getHttpServer())
      .post(`/auctions/drafts/${id}/publish`)
      .set('Authorization', authOf(sellerId))
      .expect(200);

    return id;
  };

  const createDraft = async () => {
    const created = await request(app.getHttpServer())
      .post('/auctions/drafts')
      .set('Authorization', authOf(sellerId))
      .send({
        title: draftTitle,
        description: 'Nobody may look at this yet.',
        categoryId,
        condition: 'USED',
        startingPrice: 1000,
        minBidIncrement: 50,
        scheduledStartAt: hoursFromNow(2),
        scheduledEndAt: hoursFromNow(6),
        imageUrls: ['https://placehold.co/600x400?text=Draft']
      })
      .expect(201);

    return (created.body as { id: string }).id;
  };

  type Lobby = {
    auction: { id: string; status: string; minimumNextBid: string };
    participantCount: number;
    countdown: {
      serverTime: string;
      startsAt: string | null;
      endsAt: string | null;
      msUntilStart: number | null;
      msUntilEnd: number | null;
    };
    you: { joined: boolean; joinedAt: string | null } | null;
  };

  const readLobby = async (auctionId: string, viewerId?: string) => {
    const call = request(app.getHttpServer()).get(
      `/auctions/${auctionId}/lobby`
    );
    if (viewerId) call.set('Authorization', authOf(viewerId));

    const response = await call.expect(200);
    return response.body as Lobby;
  };

  const join = (auctionId: string, userId: string) =>
    request(app.getHttpServer())
      .post(`/auctions/${auctionId}/participants`)
      .set('Authorization', authOf(userId));

  const leave = (auctionId: string, userId: string) =>
    request(app.getHttpServer())
      .delete(`/auctions/${auctionId}/participants`)
      .set('Authorization', authOf(userId));

  const bid = (auctionId: string, userId: string, amount: number) =>
    request(app.getHttpServer())
      .post(`/auctions/${auctionId}/bids`)
      .set('Authorization', authOf(userId))
      .send({ amount, clientRequestId: randomUUID() });

  type Arena = Lobby & {
    leader: {
      amount: string;
      sequenceNo: number;
      bidder: string;
      isYours: boolean;
    } | null;
    recentBids: { amount: string; sequenceNo: number; bidder: string }[];
    result: {
      outcome: 'SOLD' | 'UNSOLD';
      endedAt: string | null;
      soldPrice: string | null;
      finalPrice: string | null;
      bidCount: number;
      reserveMet: boolean;
      winner: { amount: string; bidder: string; isYours: boolean } | null;
    } | null;
    suddenDeath: {
      active: boolean;
      windowMs: number;
      extensionMs: number;
      extensionCount: number;
      extensionsRemaining: number;
      lastExtension: {
        extensionNumber: number;
        previousEndAt: string;
        newEndAt: string;
      } | null;
    };
    you:
      | (NonNullable<Lobby['you']> & {
          canBid: boolean;
          blockedBy: string | null;
        })
      | null;
  };

  const readArena = async (auctionId: string, viewerId?: string) => {
    const call = request(app.getHttpServer()).get(
      `/auctions/${auctionId}/arena`
    );
    if (viewerId) call.set('Authorization', authOf(viewerId));

    const response = await call.expect(200);
    return response.body as Arena;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = configureApp(
      moduleFixture.createNestApplication()
    ) as INestApplication<App>;
    prisma = app.get(PrismaService);
    lifecycle = app.get(AuctionLifecycleService);
    // Listen once for the whole suite rather than leaving the server idle.
    // supertest opens an ephemeral listener per request against an idle
    // server and closes it again straight after; back-to-back requests can
    // then land on a socket whose listener is already going away.
    await app.listen(0);

    // No client ever connects to the gateway in these tests, so every event
    // it emits goes nowhere. Spying on it is what makes the broadcasts visible.
    broadcasts = jest.spyOn(app.get(AuctionGateway), 'emitToAuction');

    sellerId = await createUser(sellerEmail, 'USER');
    buyerId = await createUser(buyerEmail, 'USER');
    strangerId = await createUser(strangerEmail, 'USER');
    adminId = await createUser(adminEmail, 'ADMIN');

    const category = await prisma.category.create({
      data: { name: `E2E Live ${run}`, slug: `e2e-live-${run}` },
      select: { id: true }
    });
    categoryId = category.id;

    authOf = await authRegistry(app, [sellerId, buyerId, strangerId, adminId]);
  });

  beforeEach(() => {
    broadcasts.mockClear();
  });

  afterAll(async () => {
    const userIds = [sellerId, buyerId, strangerId, adminId];
    await prisma.auctionParticipant.deleteMany({
      where: { auction: { sellerId: { in: userIds } } }
    });
    // extensions point at bids, and bids at auctions — unwind in that order
    await prisma.auctionExtension.deleteMany({
      where: { auction: { sellerId: { in: userIds } } }
    });
    await prisma.bid.deleteMany({ where: { bidderId: { in: userIds } } });
    await prisma.auction.deleteMany({ where: { sellerId: { in: userIds } } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  describe('GET /auctions/:id/lobby', () => {
    it('shows a signed-out visitor the auction, the count and the countdown', async () => {
      const auctionId = await publishAuction(1);

      const lobby = await readLobby(auctionId);

      expect(lobby.auction).toMatchObject({
        id: auctionId,
        status: 'SCHEDULED',
        title: auctionTitle
      });
      expect(lobby.participantCount).toBe(0);
      expect(lobby.you).toBeNull();
    });

    it('counts down to the start of an auction that has not begun', async () => {
      const auctionId = await publishAuction(1);

      const { countdown } = await readLobby(auctionId);

      const oneHour = 60 * 60 * 1000;
      expect(countdown.msUntilStart).toBeGreaterThan(oneHour - 60_000);
      expect(countdown.msUntilStart).toBeLessThanOrEqual(oneHour);
      expect(countdown.startsAt).not.toBeNull();
      expect(countdown.endsAt).not.toBeNull();
    });

    // a running auction started in the past, and "how long until it started"
    // is not a thing a screen counts down
    it('reports zero rather than a negative number once the start has passed', async () => {
      const auctionId = await publishAuction(-1);

      const { countdown } = await readLobby(auctionId);

      expect(countdown.msUntilStart).toBe(0);
      expect(countdown.msUntilEnd).toBeGreaterThan(0);
    });

    it('sends its own clock so a client with a wrong one can still count', async () => {
      const auctionId = await publishAuction(1);

      const { countdown } = await readLobby(auctionId);

      expect(Date.parse(countdown.serverTime)).toBeGreaterThan(0);
    });

    // AUC-003 — the lobby shows the auction, so it inherits the same duty
    it('never sends the reserve to a visitor or to another user', async () => {
      const auctionId = await publishAuction(1);

      const anonymous = await readLobby(auctionId);
      const stranger = await readLobby(auctionId, strangerId);

      expectNoReserve(anonymous, 4500);
      expectNoReserve(stranger, 4500);
    });

    it('still shows the seller their own reserve', async () => {
      const auctionId = await publishAuction(1);

      const lobby = await readLobby(auctionId, sellerId);

      expect(lobby.auction).toMatchObject({ reservePrice: '4500' });
    });

    it('hides the lobby of a draft, the way the auction read hides the draft', async () => {
      const draftId = await createDraft();

      await request(app.getHttpServer())
        .get(`/auctions/${draftId}/lobby`)
        .set('Authorization', authOf(sellerId))
        .expect(404);
    });

    it('answers 404 for an auction that does not exist', async () => {
      await request(app.getHttpServer())
        .get(`/auctions/${randomUUID()}/lobby`)
        .expect(404);
    });
  });

  describe('POST /auctions/:id/participants', () => {
    it('counts the person who joined, for everybody looking', async () => {
      const auctionId = await publishAuction(1);

      const joined = await join(auctionId, buyerId).expect(200);

      expect(joined.body).toMatchObject({
        auctionId,
        joined: true,
        participantCount: 1
      });
      expect((await readLobby(auctionId)).participantCount).toBe(1);
    });

    it('tells the person who joined that they are in', async () => {
      const auctionId = await publishAuction(1);
      await join(auctionId, buyerId).expect(200);

      const lobby = await readLobby(auctionId, buyerId);

      expect(lobby.you).toMatchObject({ joined: true });
      expect(lobby.you?.joinedAt).not.toBeNull();
    });

    it('leaves a different signed-in viewer out of it', async () => {
      const auctionId = await publishAuction(1);
      await join(auctionId, buyerId).expect(200);

      const lobby = await readLobby(auctionId, strangerId);

      expect(lobby.you).toEqual({ joined: false, joinedAt: null });
      expect(lobby.participantCount).toBe(1);
    });

    it('pushes the new count to the room rather than waiting to be asked', async () => {
      const auctionId = await publishAuction(1);

      await join(auctionId, buyerId).expect(200);

      expect(broadcasts).toHaveBeenCalledWith(
        auctionId,
        'auction:presence',
        expect.objectContaining({ auctionId, participantCount: 1 })
      );
    });

    // a client that reconnects and rejoins must not make the number jump
    it('is idempotent — joining twice is one participant', async () => {
      const auctionId = await publishAuction(1);

      await join(auctionId, buyerId).expect(200);
      const second = await join(auctionId, buyerId).expect(200);

      expect(second.body).toMatchObject({ participantCount: 1 });
      expect(broadcasts).toHaveBeenCalledTimes(1);
    });

    it('counts two different people separately', async () => {
      const auctionId = await publishAuction(1);

      await join(auctionId, buyerId).expect(200);
      const second = await join(auctionId, strangerId).expect(200);

      expect(second.body).toMatchObject({ participantCount: 2 });
    });

    // joining is not bidding: the seller may watch their own auction
    it('lets the seller join their own auction', async () => {
      const auctionId = await publishAuction(1);

      await join(auctionId, sellerId).expect(200);

      expect((await readLobby(auctionId)).participantCount).toBe(1);
    });

    it('lets somebody join an auction that is already running', async () => {
      const auctionId = await publishAuction(-1);

      await join(auctionId, buyerId).expect(200);

      const lobby = await readLobby(auctionId, buyerId);
      expect(lobby.auction.status).toBe('ACTIVE');
      expect(lobby.you).toMatchObject({ joined: true });
    });

    it('refuses an auction that has already finished', async () => {
      const auctionId = await publishAuction(-1);
      // the auction runs out of time, and the next read settles it (AUC-007)
      await prisma.auction.update({
        where: { id: auctionId },
        data: { currentEndAt: new Date(Date.now() - 1000) }
      });
      await request(app.getHttpServer())
        .get(`/auctions/${auctionId}`)
        .expect(200);

      await join(auctionId, buyerId).expect(409);
    });

    // saying "you cannot join it" would confirm a private draft exists
    it('gives nothing away about a draft', async () => {
      const draftId = await createDraft();

      await join(draftId, buyerId).expect(404);
    });

    // SRS 2 — admins moderate the marketplace, they do not take part in it
    it('keeps admins out', async () => {
      const auctionId = await publishAuction(1);

      await join(auctionId, adminId).expect(403);
    });

    it('turns away a visitor who is not signed in', async () => {
      const auctionId = await publishAuction(1);

      await request(app.getHttpServer())
        .post(`/auctions/${auctionId}/participants`)
        .expect(401);
    });
  });

  describe('DELETE /auctions/:id/participants', () => {
    it('drops the person from the count', async () => {
      const auctionId = await publishAuction(1);
      await join(auctionId, buyerId).expect(200);

      const left = await leave(auctionId, buyerId).expect(200);

      expect(left.body).toMatchObject({
        auctionId,
        joined: false,
        participantCount: 0
      });
      expect((await readLobby(auctionId, buyerId)).you).toEqual({
        joined: false,
        joinedAt: null
      });
    });

    it('pushes the new count to the room', async () => {
      const auctionId = await publishAuction(1);
      await join(auctionId, buyerId).expect(200);
      broadcasts.mockClear();

      await leave(auctionId, buyerId).expect(200);

      expect(broadcasts).toHaveBeenCalledWith(
        auctionId,
        'auction:presence',
        expect.objectContaining({ participantCount: 0 })
      );
    });

    it('is harmless when the person was never here', async () => {
      const auctionId = await publishAuction(1);

      const left = await leave(auctionId, buyerId).expect(200);

      expect(left.body).toMatchObject({ participantCount: 0 });
      expect(broadcasts).not.toHaveBeenCalled();
    });

    it('lets somebody come back, keeping the time they first arrived', async () => {
      const auctionId = await publishAuction(1);
      const first = await join(auctionId, buyerId).expect(200);
      await leave(auctionId, buyerId).expect(200);

      const back = await join(auctionId, buyerId).expect(200);

      expect(back.body).toMatchObject({
        joined: true,
        participantCount: 1,
        joinedAt: (first.body as { joinedAt: string }).joinedAt
      });
    });
  });

  /**
   * LIV-002 — the arena while an auction runs: the price, who is leading, the
   * latest bids, the time left, the lowest amount that will be accepted, the
   * reserve state, and whether the person looking may bid at all.
   */
  describe('GET /auctions/:id/arena', () => {
    it('shows a signed-out visitor the bidding without naming anybody', async () => {
      const auctionId = await publishAuction(-1);
      await bid(auctionId, buyerId, 3000).expect(201);

      const arena = await readArena(auctionId);

      expect(arena.auction).toMatchObject({
        status: 'ACTIVE',
        currentPrice: '3000',
        biddingOpen: true,
        reserveMet: false
      });
      expect(arena.leader).toMatchObject({ amount: '3000', isYours: false });
      expect(arena.leader).not.toHaveProperty('bidderId');
      expect(arena.you).toBeNull();
    });

    it('reports the lowest amount that will be accepted', async () => {
      const auctionId = await publishAuction(-1);

      const beforeAnyBid = await readArena(auctionId);
      expect(beforeAnyBid.auction).toMatchObject({ minimumNextBid: '3000' });

      await bid(auctionId, buyerId, 3000).expect(201);

      const afterOneBid = await readArena(auctionId);
      expect(afterOneBid.auction).toMatchObject({ minimumNextBid: '3100' });
    });

    // the number on the screen has to be a number the endpoint will take
    it('offers a minimum the bid endpoint actually accepts', async () => {
      const auctionId = await publishAuction(-1);
      await bid(auctionId, buyerId, 3000).expect(201);

      const arena = await readArena(auctionId);

      await bid(
        auctionId,
        strangerId,
        Number(arena.auction.minimumNextBid)
      ).expect(201);
    });

    it('masks the leader the same way the history does', async () => {
      const auctionId = await publishAuction(-1);
      await bid(auctionId, buyerId, 3000).expect(201);

      const arena = await readArena(auctionId);
      const history = await request(app.getHttpServer())
        .get(`/auctions/${auctionId}/bids`)
        .expect(200);

      const [firstInHistory] = (history.body as { items: { bidder: string }[] })
        .items;
      expect(arena.leader?.bidder).toBe(firstInHistory.bidder);
    });

    it('names the highest bidder as the leader, not the newest', async () => {
      const auctionId = await publishAuction(-1);
      await bid(auctionId, buyerId, 3000).expect(201);
      await bid(auctionId, strangerId, 3500).expect(201);

      const arena = await readArena(auctionId, strangerId);

      expect(arena.leader).toMatchObject({
        amount: '3500',
        sequenceNo: 2,
        isYours: true
      });
    });

    it('lists the latest bids newest first', async () => {
      const auctionId = await publishAuction(-1);
      await bid(auctionId, buyerId, 3000).expect(201);
      await bid(auctionId, strangerId, 3500).expect(201);
      await bid(auctionId, buyerId, 4000).expect(201);

      const arena = await readArena(auctionId);

      expect(arena.recentBids.map((row) => row.amount)).toEqual([
        '4000',
        '3500',
        '3000'
      ]);
    });

    it('has no leader and no bids before anybody has bid', async () => {
      const auctionId = await publishAuction(-1);

      const arena = await readArena(auctionId);

      expect(arena.leader).toBeNull();
      expect(arena.recentBids).toEqual([]);
    });

    // AUC-003 over the wire again — the arena shows the auction, so it inherits
    // the duty, and reserveMet is the only thing derived from the reserve
    it('never sends the reserve, even to the leader', async () => {
      const auctionId = await publishAuction(-1);
      await bid(auctionId, buyerId, 3000).expect(201);

      expectNoReserve(await readArena(auctionId), 4500);
      expectNoReserve(await readArena(auctionId, buyerId), 4500);
    });

    it('reports the reserve being met without saying what it was', async () => {
      const auctionId = await publishAuction(-1);
      await bid(auctionId, buyerId, 5000).expect(201);

      const arena = await readArena(auctionId, buyerId);

      expect(arena.auction).toMatchObject({ reserveMet: true });
      expectNoReserve(arena, 4500);
    });

    describe('whether the person looking may bid', () => {
      it('tells a signed-in user they may', async () => {
        const auctionId = await publishAuction(-1);

        const arena = await readArena(auctionId, buyerId);

        expect(arena.you).toMatchObject({ canBid: true, blockedBy: null });
      });

      it('tells the seller why they may not', async () => {
        const auctionId = await publishAuction(-1);

        const arena = await readArena(auctionId, sellerId);

        expect(arena.you).toMatchObject({
          canBid: false,
          blockedBy: 'YOU_ARE_THE_SELLER'
        });
      });

      it('tells an admin why they may not', async () => {
        const auctionId = await publishAuction(-1);

        const arena = await readArena(auctionId, adminId);

        expect(arena.you).toMatchObject({
          canBid: false,
          blockedBy: 'ADMINS_DO_NOT_BID'
        });
      });

      it('reports an auction that has not opened yet', async () => {
        const auctionId = await publishAuction(1);

        const arena = await readArena(auctionId, buyerId);

        expect(arena.auction).toMatchObject({ biddingOpen: false });
        expect(arena.you).toMatchObject({
          canBid: false,
          blockedBy: 'AUCTION_NOT_OPEN'
        });
      });

      // the report must not disagree with the endpoint it describes
      it('is refused by the bid endpoint for the same reason it gave', async () => {
        const auctionId = await publishAuction(-1);

        const arena = await readArena(auctionId, sellerId);

        expect(arena.you?.blockedBy).toBe('YOU_ARE_THE_SELLER');
        await bid(auctionId, sellerId, 3000).expect(403);
      });
    });

    it('answers 404 for an auction that does not exist', async () => {
      await request(app.getHttpServer())
        .get(`/auctions/${randomUUID()}/arena`)
        .expect(404);
    });

    it('hides the arena of a draft', async () => {
      const draftId = await createDraft();

      await request(app.getHttpServer())
        .get(`/auctions/${draftId}/arena`)
        .set('Authorization', authOf(sellerId))
        .expect(404);
    });
  });

  /**
   * LIV-004 — "เมื่อจบแสดงผล Sold/Unsold/ราคาสุดท้าย". Settlement itself is
   * AUC-007's and is tested there; this is about what the finished auction
   * reports and what the room is told.
   */
  describe('the result (LIV-004)', () => {
    /**
     * Runs an auction out of time and lets the next read settle it (AUC-007),
     * which is how a real auction with nobody watching ends.
     */
    const runOutOfTime = async (auctionId: string) => {
      await prisma.auction.update({
        where: { id: auctionId },
        data: { currentEndAt: new Date(Date.now() - 1000) }
      });

      await request(app.getHttpServer())
        .get(`/auctions/${auctionId}`)
        .expect(200);
    };

    it('reports nothing while the auction is still running', async () => {
      const auctionId = await publishAuction(-1);
      await bid(auctionId, buyerId, 3000).expect(201);

      expect((await readArena(auctionId)).result).toBeNull();
    });

    it('reports a sale with its price, its winner and when it ended', async () => {
      const auctionId = await publishAuction(-1);
      // the reserve is 4500, so this clears it
      await bid(auctionId, buyerId, 5000).expect(201);
      await runOutOfTime(auctionId);

      const arena = await readArena(auctionId, buyerId);

      expect(arena.auction).toMatchObject({
        status: 'SOLD',
        soldPrice: '5000',
        biddingOpen: false
      });
      expect(arena.result).toMatchObject({
        outcome: 'SOLD',
        soldPrice: '5000',
        finalPrice: '5000',
        reserveMet: true,
        bidCount: 1
      });
      expect(arena.result?.winner).toMatchObject({ isYours: true });
      expect(arena.result?.endedAt).not.toBeNull();
    });

    it('names the winner masked, to everybody', async () => {
      const auctionId = await publishAuction(-1);
      await bid(auctionId, buyerId, 5000).expect(201);
      await runOutOfTime(auctionId);

      const stranger = await readArena(auctionId, strangerId);

      expect(stranger.result?.winner?.bidder).toMatch(/\*/);
      expect(stranger.result?.winner).not.toHaveProperty('bidderId');
      expect(stranger.result?.winner?.isYours).toBe(false);
    });

    it('reports an auction whose top bid missed the reserve as UNSOLD', async () => {
      const auctionId = await publishAuction(-1);
      // 3000 is above the starting price but below the 4500 reserve
      await bid(auctionId, buyerId, 3000).expect(201);
      await runOutOfTime(auctionId);

      const arena = await readArena(auctionId, buyerId);

      expect(arena.auction).toMatchObject({
        status: 'UNSOLD',
        soldPrice: null
      });
      expect(arena.result).toMatchObject({
        outcome: 'UNSOLD',
        soldPrice: null,
        // "ราคาสุดท้าย" is still what the bidding reached
        finalPrice: '3000',
        reserveMet: false,
        winner: null
      });
    });

    it('reports an auction nobody bid on', async () => {
      const auctionId = await publishAuction(-1);
      await runOutOfTime(auctionId);

      const arena = await readArena(auctionId);

      expect(arena.result).toMatchObject({
        outcome: 'UNSOLD',
        bidCount: 0,
        finalPrice: null,
        soldPrice: null,
        winner: null
      });
    });

    // AUC-003 — the reserve stays private after the auction ends too
    it('never sends the reserve, sold or unsold', async () => {
      const sold = await publishAuction(-1);
      await bid(sold, buyerId, 5000).expect(201);
      await runOutOfTime(sold);

      const unsold = await publishAuction(-1);
      await bid(unsold, buyerId, 3000).expect(201);
      await runOutOfTime(unsold);

      expectNoReserve(await readArena(sold, buyerId), 4500);
      expectNoReserve(await readArena(unsold, buyerId), 4500);
    });

    it('tells the room, so a screen flips to the result by itself', async () => {
      const auctionId = await publishAuction(-1);
      await bid(auctionId, buyerId, 5000).expect(201);
      broadcasts.mockClear();

      await runOutOfTime(auctionId);

      expect(broadcasts).toHaveBeenCalledWith(
        auctionId,
        'auction:ended',
        expect.objectContaining({
          auctionId,
          status: 'SOLD',
          soldPrice: '5000'
        })
      );
    });

    // the scheduler settles auctions nobody is looking at, and those rooms
    // need telling just as much
    it('tells the room when the scheduler is what settled it', async () => {
      const auctionId = await publishAuction(-1);
      await bid(auctionId, buyerId, 5000).expect(201);
      await prisma.auction.update({
        where: { id: auctionId },
        data: { currentEndAt: new Date(Date.now() - 1000) }
      });
      broadcasts.mockClear();

      await lifecycle.reconcileLifecycle();

      expect(broadcasts).toHaveBeenCalledWith(
        auctionId,
        'auction:ended',
        expect.objectContaining({ status: 'SOLD' })
      );
    });

    it('announces the result once, however many readers arrive', async () => {
      const auctionId = await publishAuction(-1);
      await bid(auctionId, buyerId, 5000).expect(201);
      await prisma.auction.update({
        where: { id: auctionId },
        data: { currentEndAt: new Date(Date.now() - 1000) }
      });
      broadcasts.mockClear();

      await Promise.all([
        readArena(auctionId),
        readArena(auctionId),
        readArena(auctionId)
      ]);

      const ended = (broadcasts.mock.calls as [string, string][]).filter(
        ([, event]) => event === 'auction:ended'
      );
      expect(ended).toHaveLength(1);
    });
  });

  /**
   * LIV-003 — "แสดงจำนวนครั้งที่ต่อเวลา/เวลาสิ้นสุดใหม่ในสถานะเร่งด่วนที่
   * เข้าถึงง่าย". The rule itself is BID-004's and is tested there; this is
   * about the arena reporting it so a screen never has to work it out.
   */
  describe('sudden death on the arena (LIV-003)', () => {
    const MINUTE = 60 * 1000;

    /**
     * A running auction ending `endsInMinutes` from now, with `used`
     * extensions already spent. Published normally, then aged into position —
     * AUC-004 refuses to publish something already at its deadline.
     */
    const endingSoon = async (endsInMinutes: number, used = 0) => {
      const auctionId = await publishAuction(-1);

      await prisma.auction.update({
        where: { id: auctionId },
        data: {
          currentEndAt: new Date(Date.now() + endsInMinutes * MINUTE),
          extensionCount: used
        }
      });

      return auctionId;
    };

    it('stays quiet while there is plenty of time left', async () => {
      const auctionId = await publishAuction(-1);

      const { suddenDeath } = await readArena(auctionId);

      expect(suddenDeath).toMatchObject({
        active: false,
        extensionCount: 0,
        extensionsRemaining: 5,
        lastExtension: null
      });
    });

    it('turns urgent inside the last two minutes', async () => {
      const auctionId = await endingSoon(1);

      const { suddenDeath } = await readArena(auctionId);

      expect(suddenDeath.active).toBe(true);
    });

    // a screen should not have to know BID-004's numbers to describe them
    it('sends the window and the extension length', async () => {
      const auctionId = await endingSoon(1);

      const { suddenDeath } = await readArena(auctionId);

      expect(suddenDeath).toMatchObject({
        windowMs: 2 * MINUTE,
        extensionMs: 2 * MINUTE
      });
    });

    it('reports the deadline moving after a bid extends it', async () => {
      const auctionId = await endingSoon(1);
      const before = await readArena(auctionId);

      await bid(auctionId, buyerId, 3000).expect(201);

      const after = await readArena(auctionId);
      expect(after.suddenDeath).toMatchObject({
        extensionCount: 1,
        extensionsRemaining: 4
      });
      expect(after.suddenDeath.lastExtension).toMatchObject({
        extensionNumber: 1
      });
      expect(
        Date.parse(after.suddenDeath.lastExtension!.newEndAt)
      ).toBeGreaterThan(
        Date.parse(after.suddenDeath.lastExtension!.previousEndAt)
      );
      expect(before.suddenDeath.lastExtension).toBeNull();
    });

    // the extension the arena reports has to be the one that actually happened
    it('agrees with the auction it describes about the new deadline', async () => {
      const auctionId = await endingSoon(1);
      await bid(auctionId, buyerId, 3000).expect(201);

      const arena = await readArena(auctionId);

      expect(arena.suddenDeath.lastExtension?.newEndAt).toBe(
        arena.countdown.endsAt
      );
    });

    it('reports the latest extension, not the first', async () => {
      const auctionId = await endingSoon(1);
      await bid(auctionId, buyerId, 3000).expect(201);
      // the first bid pushed the end two minutes out, back outside the window
      await prisma.auction.update({
        where: { id: auctionId },
        data: { currentEndAt: new Date(Date.now() + MINUTE) }
      });
      await bid(auctionId, strangerId, 3500).expect(201);

      const arena = await readArena(auctionId);

      expect(arena.suddenDeath).toMatchObject({
        extensionCount: 2,
        extensionsRemaining: 3
      });
      expect(arena.suddenDeath.lastExtension).toMatchObject({
        extensionNumber: 2
      });
    });

    // the last two minutes of an auction that can no longer be extended are
    // the most urgent it gets, not the least
    it('stays urgent once the five extensions are spent', async () => {
      const auctionId = await endingSoon(1, 5);

      const { suddenDeath } = await readArena(auctionId);

      expect(suddenDeath).toMatchObject({
        active: true,
        extensionsRemaining: 0
      });
    });

    it('is quiet on an auction that has not opened yet', async () => {
      const auctionId = await publishAuction(1);

      const { suddenDeath } = await readArena(auctionId);

      expect(suddenDeath.active).toBe(false);
    });
  });

  /**
   * LIV-001 — "เปลี่ยนสถานะเริ่มประมูลอัตโนมัติ". The scheduler is switched
   * off under test (see app.module), so the pass is called directly here —
   * which is also the only way to assert on it without waiting ten seconds.
   */
  describe('an auction opening by itself', () => {
    it('turns a scheduled auction ACTIVE once its time arrives', async () => {
      const auctionId = await publishAuction(1);
      await prisma.auction.update({
        where: { id: auctionId },
        data: { scheduledStartAt: new Date(Date.now() - 1000) }
      });

      await lifecycle.reconcileLifecycle();

      const lobby = await readLobby(auctionId);
      expect(lobby.auction.status).toBe('ACTIVE');
      expect(lobby.countdown.msUntilStart).toBe(0);
    });

    it('tells the room, so a lobby flips over without asking again', async () => {
      const auctionId = await publishAuction(1);
      await prisma.auction.update({
        where: { id: auctionId },
        data: { scheduledStartAt: new Date(Date.now() - 1000) }
      });

      await lifecycle.reconcileLifecycle();

      expect(broadcasts).toHaveBeenCalledWith(
        auctionId,
        'auction:started',
        expect.objectContaining({ auctionId, status: 'ACTIVE' })
      );
    });

    it('leaves an auction whose time has not come alone', async () => {
      const auctionId = await publishAuction(1);

      await lifecycle.reconcileLifecycle();

      expect((await readLobby(auctionId)).auction.status).toBe('SCHEDULED');
    });
  });
});

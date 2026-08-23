import { Injectable } from '@nestjs/common';

/** One person's presence in one auction, as far as this process can see it. */
export type Membership = { auctionId: string; userId: string };

/**
 * LIV-001 — which signed-in person each socket belongs to, and which auctions
 * they are watching.
 *
 * Presence is recorded over HTTP (POST /participants), but nothing over HTTP
 * can tell when somebody closes the tab. A socket can: it disconnects. This
 * holds the link between the two so a dropped connection can mark somebody
 * absent again.
 *
 * In memory on purpose, and correct because of it: it describes who is
 * connected to *this* process, and if the process restarts every socket it was
 * holding has gone with it. A second instance would need its own copy of the
 * same fact, not a shared one.
 *
 * Counted rather than flagged, because one person can have the same auction
 * open in two tabs. Closing one of them is not leaving.
 */
@Injectable()
export class PresenceRegistry {
  /** socket id -> the auctions that socket is present in, as one user. */
  private readonly bySocket = new Map<string, Map<string, string>>();

  /** `${auctionId}:${userId}` -> how many sockets are holding it open. */
  private readonly connections = new Map<string, number>();

  /**
   * Records that this socket is watching this auction as this person.
   * Registering the same pair twice changes nothing — a client that rejoins a
   * room it is already in must not double-count itself.
   */
  register(socketId: string, auctionId: string, userId: string): void {
    const auctions = this.bySocket.get(socketId) ?? new Map<string, string>();

    if (auctions.get(auctionId) === userId) return;

    auctions.set(auctionId, userId);
    this.bySocket.set(socketId, auctions);
    this.bump(auctionId, userId, 1);
  }

  /**
   * Drops one socket's hold on one auction.
   *
   * Returns true only when that was the person's last connection to it, which
   * is the moment they have actually gone.
   */
  unregister(socketId: string, auctionId: string): boolean {
    const auctions = this.bySocket.get(socketId);
    const userId = auctions?.get(auctionId);

    if (!auctions || !userId) return false;

    auctions.delete(auctionId);
    if (auctions.size === 0) this.bySocket.delete(socketId);

    return this.bump(auctionId, userId, -1) === 0;
  }

  /**
   * Everything a socket was holding, released at once. Returns the
   * memberships that were the person's last connection — the ones a caller
   * should now mark absent.
   */
  releaseSocket(socketId: string): Membership[] {
    const auctions = this.bySocket.get(socketId);
    if (!auctions) return [];

    const gone: Membership[] = [];

    for (const [auctionId, userId] of [...auctions]) {
      if (this.unregister(socketId, auctionId)) {
        gone.push({ auctionId, userId });
      }
    }

    return gone;
  }

  private bump(auctionId: string, userId: string, by: number): number {
    const key = `${auctionId}:${userId}`;
    const next = (this.connections.get(key) ?? 0) + by;

    if (next <= 0) {
      this.connections.delete(key);
      return 0;
    }

    this.connections.set(key, next);
    return next;
  }
}

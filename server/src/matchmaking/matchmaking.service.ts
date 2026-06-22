import { Injectable, BadRequestException } from '@nestjs/common';
import { TIME_CONTROL_BY_ID } from '@chess/shared';
import { RedisService } from '../common/redis.service';
import { RatingService } from '../rating/rating.service';
import { GameManager } from '../game/game-manager';

/** Initial rating tolerance for a fresh pairing (points). */
const BASE_TOLERANCE = 300;
/** How fast the tolerance widens per second a player waits (points/sec). */
const WIDEN_PER_SEC = 150;

export interface PairMatch {
  gameId: string;
  players: string[];
}

@Injectable()
export class MatchmakingService {
  constructor(
    private readonly redis: RedisService,
    private readonly rating: RatingService,
    private readonly games: GameManager,
  ) {}

  private qKey(tcId: string) {
    return `mm:q:${tcId}`;
  }

  private tKey(tcId: string) {
    return `mm:t:${tcId}`;
  }

  /**
   * Add a player to a time-control queue (idempotent). Pairing is performed
   * separately by {@link tryPair}, which both join handling and a periodic
   * sweep call — so two players who enqueue without seeing each other still get
   * matched, and the search radius widens the longer they wait.
   */
  async enqueue(userId: string, timeControlId: string): Promise<void> {
    const tc = TIME_CONTROL_BY_ID[timeControlId];
    if (!tc) throw new BadRequestException('unknown time control');
    const rating = await this.rating.getOrCreate(userId, tc.category);
    const redis = this.redis.client;
    await redis.zadd(this.qKey(tc.id), rating.rating, userId);
    // Record the wait start once; don't reset it if already queued.
    await redis.hsetnx(this.tKey(tc.id), userId, Date.now().toString());
  }

  async leave(userId: string): Promise<void> {
    const redis = this.redis.client;
    for (const tcId of Object.keys(TIME_CONTROL_BY_ID)) {
      await redis.zrem(this.qKey(tcId), userId);
      await redis.hdel(this.tKey(tcId), userId);
    }
  }

  /**
   * Greedily pair waiting players for a time control. Players are scanned in
   * rating order so the closest-rated pairs match first; the allowed rating gap
   * widens with how long the longer-waiting player has been queued, guaranteeing
   * that any two waiting players eventually match even if their ratings diverged.
   * Returns every match created in this pass.
   */
  async tryPair(timeControlId: string): Promise<PairMatch[]> {
    const tc = TIME_CONTROL_BY_ID[timeControlId];
    if (!tc) return [];
    const key = this.qKey(tc.id);
    const tkey = this.tKey(tc.id);
    const redis = this.redis.client;
    const matches: PairMatch[] = [];
    const now = Date.now();

    // Bounded loop: re-read after each pairing since the set shrinks.
    for (let guard = 0; guard < 1000; guard++) {
      const flat = await redis.zrange(key, 0, -1, 'WITHSCORES');
      if (flat.length < 4) break; // need at least two members
      const members: { id: string; score: number }[] = [];
      for (let i = 0; i < flat.length; i += 2) {
        members.push({ id: flat[i], score: Number(flat[i + 1]) });
      }
      const times = await redis.hgetall(tkey);

      let pairedThisPass = false;
      for (let i = 0; i < members.length - 1; i++) {
        const a = members[i];
        const b = members[i + 1];
        const waitedSec = (now - Math.min(Number(times[a.id] ?? now), Number(times[b.id] ?? now))) / 1000;
        const tolerance = BASE_TOLERANCE + WIDEN_PER_SEC * waitedSec;
        if (Math.abs(a.score - b.score) > tolerance) continue;

        // Claim both; require each ZREM to succeed so a concurrent pass (the
        // sweep vs. a join) can't double-book a player.
        const claimedA = await redis.zrem(key, a.id);
        const claimedB = await redis.zrem(key, b.id);
        if (claimedA === 1 && claimedB === 1) {
          await redis.hdel(tkey, a.id, b.id);
          matches.push(await this.pair(a.id, b.id, tc.id));
          pairedThisPass = true;
          break; // restart scan with the shrunken set
        }
        // Partial claim: another pass took one of them — put back what we got.
        if (claimedA === 1) await redis.zadd(key, a.score, a.id);
        if (claimedB === 1) await redis.zadd(key, b.score, b.id);
      }
      if (!pairedThisPass) break;
    }
    return matches;
  }

  private async pair(a: string, b: string, timeControlId: string): Promise<PairMatch> {
    const tc = TIME_CONTROL_BY_ID[timeControlId];
    // Randomise colours.
    const [whiteId, blackId] = Math.random() < 0.5 ? [a, b] : [b, a];
    const gameId = await this.games.createGame({
      whiteId,
      blackId,
      category: tc.category,
      initialSec: tc.initialSec,
      incrementSec: tc.incrementSec,
      rated: true,
    });
    return { gameId, players: [a, b] };
  }
}

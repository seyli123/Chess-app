import { Injectable, BadRequestException } from '@nestjs/common';
import { TIME_CONTROL_BY_ID } from '@chess/shared';
import { RedisService } from '../common/redis.service';
import { RatingService } from '../rating/rating.service';
import { GameManager } from '../game/game-manager';

const DEFAULT_RANGE = 300;

export type MatchResult =
  | { matched: false }
  | { matched: true; gameId: string; players: string[] };

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

  /**
   * Try to pair the joining player with a waiting opponent within rating range.
   * If none, enqueue the player and return { matched: false }.
   */
  async join(userId: string, timeControlId: string, ratingRange?: number): Promise<MatchResult> {
    const tc = TIME_CONTROL_BY_ID[timeControlId];
    if (!tc) throw new BadRequestException('unknown time control');
    const range = Math.min(Math.max(ratingRange ?? DEFAULT_RANGE, 50), 1000);

    const rating = await this.rating.getOrCreate(userId, tc.category);
    const r = rating.rating;
    const key = this.qKey(tc.id);
    const redis = this.redis.client;

    // Look for a waiting opponent within range (excluding self / collusion guard).
    const candidates = await redis.zrangebyscore(key, r - range, r + range);
    for (const cand of candidates) {
      if (cand === userId) continue;
      // Atomically claim the candidate; ZREM == 1 means we own this match.
      const removed = await redis.zrem(key, cand);
      if (removed === 1) {
        await redis.zrem(key, userId); // in case a stale entry exists
        return this.pair(userId, cand, tc.id);
      }
    }

    // No opponent: enqueue self.
    await redis.zadd(key, r, userId);
    return { matched: false };
  }

  async leave(userId: string): Promise<void> {
    const redis = this.redis.client;
    for (const tcId of Object.keys(TIME_CONTROL_BY_ID)) {
      await redis.zrem(this.qKey(tcId), userId);
    }
  }

  private async pair(a: string, b: string, timeControlId: string): Promise<MatchResult> {
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
    return { matched: true, gameId, players: [a, b] };
  }
}

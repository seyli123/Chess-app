import { MatchmakingService } from './matchmaking.service';

/** Tiny in-memory stand-in for the subset of Redis the service uses. */
class FakeRedis {
  private z = new Map<string, Map<string, number>>();
  private h = new Map<string, Map<string, string>>();

  async zadd(key: string, score: number | string, member: string) {
    const m = this.z.get(key) ?? new Map();
    m.set(member, Number(score));
    this.z.set(key, m);
    return 1;
  }
  async hsetnx(key: string, field: string, val: string) {
    const m = this.h.get(key) ?? new Map();
    if (m.has(field)) return 0;
    m.set(field, val);
    this.h.set(key, m);
    return 1;
  }
  async zrem(key: string, member: string) {
    const m = this.z.get(key);
    return m && m.delete(member) ? 1 : 0;
  }
  async hdel(key: string, ...fields: string[]) {
    const m = this.h.get(key);
    let c = 0;
    if (m) for (const f of fields) if (m.delete(f)) c++;
    return c;
  }
  async zrange(key: string, _s: number, _e: number, withscores?: string) {
    const m = this.z.get(key) ?? new Map();
    const sorted = [...m.entries()].sort((a, b) => a[1] - b[1]);
    const flat: string[] = [];
    for (const [mem, sc] of sorted) {
      flat.push(mem);
      if (withscores === 'WITHSCORES') flat.push(String(sc));
    }
    return flat;
  }
  async hgetall(key: string) {
    const o: Record<string, string> = {};
    const m = this.h.get(key);
    if (m) for (const [k, v] of m) o[k] = v;
    return o;
  }
  /** test helper to backdate a player's wait start */
  setJoinedAt(tcId: string, userId: string, ts: number) {
    const m = this.h.get(`mm:t:${tcId}`) ?? new Map();
    m.set(userId, String(ts));
    this.h.set(`mm:t:${tcId}`, m);
  }
}

const TC = 'blitz_3_2';

function makeService(ratings: Record<string, number>) {
  const redis = new FakeRedis();
  const ratingSvc = {
    getOrCreate: jest.fn(async (userId: string) => ({ rating: ratings[userId] })),
  };
  const games = { createGame: jest.fn(async () => 'game-1') };
  const service = new MatchmakingService(
    { client: redis } as any,
    ratingSvc as any,
    games as any,
  );
  return { service, redis, games };
}

describe('MatchmakingService pairing', () => {
  it('pairs two close-rated waiting players and creates a game', async () => {
    const { service, games } = makeService({ alice: 1500, bob: 1540 });
    await service.enqueue('alice', TC);
    await service.enqueue('bob', TC);

    const matches = await service.tryPair(TC);
    expect(matches).toHaveLength(1);
    expect(matches[0].gameId).toBe('game-1');
    expect(matches[0].players.sort()).toEqual(['alice', 'bob']);
    expect(games.createGame).toHaveBeenCalledTimes(1);

    // Queue is now empty — pairing consumed both entries.
    expect(await service.tryPair(TC)).toHaveLength(0);
  });

  it('does not pair far-apart ratings immediately, but does after waiting', async () => {
    const { service, redis, games } = makeService({ low: 1200, high: 1800 });
    await service.enqueue('low', TC);
    await service.enqueue('high', TC);

    // Gap of 600 exceeds the base tolerance of 300 right away.
    expect(await service.tryPair(TC)).toHaveLength(0);
    expect(games.createGame).not.toHaveBeenCalled();

    // After ~5s of waiting the tolerance widens past the gap.
    const fiveSecondsAgo = Date.now() - 5000;
    redis.setJoinedAt(TC, 'low', fiveSecondsAgo);
    redis.setJoinedAt(TC, 'high', fiveSecondsAgo);

    const matches = await service.tryPair(TC);
    expect(matches).toHaveLength(1);
    expect(matches[0].players.sort()).toEqual(['high', 'low']);
  });

  it('leaves a single waiting player queued', async () => {
    const { service } = makeService({ solo: 1500 });
    await service.enqueue('solo', TC);
    expect(await service.tryPair(TC)).toHaveLength(0);
  });
});

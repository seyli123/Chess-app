import { GAME_EVENTS } from '@chess/shared';
import { GameManager } from './game-manager';

interface Emitted {
  room: string;
  event: string;
  payload: unknown;
}

function setup(row: Record<string, unknown> | null = {}) {
  const emitted: Emitted[] = [];
  const ns = {
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => emitted.push({ room, event, payload }),
    }),
  };
  const gameRow = row && {
    id: 'g1',
    whiteId: 'w',
    blackId: 'b',
    category: 'BLITZ',
    initialSec: 180,
    incrementSec: 0,
    rated: true,
    wagerAmount: 0n,
    tournamentId: null,
    ...row,
  };
  const gameService = { getGame: jest.fn(async () => gameRow) };
  const manager = new GameManager(gameService as never, {} as never, {} as never);
  manager.attachNamespace(ns as never);
  const createGame = jest.spyOn(manager, 'createGame').mockResolvedValue('new-game');
  const events = (e: string) => emitted.filter((x) => x.event === e);
  return { manager, createGame, emitted, events };
}

describe('GameManager rematch', () => {
  it('announces an offer, then spawns a colour-swapped game when both agree', async () => {
    const { manager, createGame, events } = setup();

    await manager.offerRematch('g1', 'w');
    expect(events(GAME_EVENTS.rematchOffered)).toEqual([
      { room: 'g1', event: GAME_EVENTS.rematchOffered, payload: { from: 'w' } },
    ]);
    expect(createGame).not.toHaveBeenCalled();

    await manager.offerRematch('g1', 'b');
    expect(createGame).toHaveBeenCalledWith(
      expect.objectContaining({ whiteId: 'b', blackId: 'w', wager: 0, rated: true }),
    );
    expect(events(GAME_EVENTS.rematchReady)).toEqual([
      { room: 'g1', event: GAME_EVENTS.rematchReady, payload: { gameId: 'new-game' } },
    ]);
  });

  it('ignores offers from non-players', async () => {
    const { manager, createGame, emitted } = setup();
    await manager.offerRematch('g1', 'intruder');
    expect(createGame).not.toHaveBeenCalled();
    expect(emitted).toHaveLength(0);
  });

  it('does not offer rematches for tournament games', async () => {
    const { manager, emitted } = setup({ tournamentId: 't1' });
    await manager.offerRematch('g1', 'w');
    expect(emitted).toHaveLength(0);
  });

  it('cancelling clears the pending offer', async () => {
    const { manager, createGame, events } = setup();
    await manager.offerRematch('g1', 'w');
    manager.cancelRematch('g1', 'w');
    expect(events(GAME_EVENTS.rematchCanceled)).toHaveLength(1);

    // The other player offering alone must not pair after a cancel.
    await manager.offerRematch('g1', 'b');
    expect(createGame).not.toHaveBeenCalled();
    manager.cancelRematch('g1', 'b'); // clear the timer it armed
  });

  it('expires an unmatched offer after the TTL', async () => {
    jest.useFakeTimers();
    try {
      const { manager, events } = setup();
      await manager.offerRematch('g1', 'w');
      jest.advanceTimersByTime(30_000);
      expect(events(GAME_EVENTS.rematchExpired)).toHaveLength(1);
    } finally {
      jest.useRealTimers();
    }
  });
});

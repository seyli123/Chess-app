import { GameClock } from './clock';

describe('GameClock', () => {
  it('does not charge time before the first move', () => {
    const c = new GameClock(180, 2, 0);
    expect(c.snapshot(5000)).toEqual({ white: 180_000, black: 180_000 });
  });

  it('charges elapsed time and adds increment on a committed move', () => {
    const c = new GameClock(180, 2, 0);
    c.commitMove(0); // white's first move starts the clock, no charge
    // black thinks 3s then moves
    c.commitMove(3000);
    const snap = c.snapshot(3000);
    // black charged 3s, +2s increment => 179s; white untouched
    expect(snap.black).toBe(179_000);
    expect(snap.white).toBe(180_000);
    expect(c.onMove).toBe('white');
  });

  it('flags when the side on move runs out', () => {
    const c = new GameClock(1, 0, 0); // 1 second each
    c.commitMove(0); // start clock, now black on move
    expect(c.hasFlagged(500)).toBe(false);
    expect(c.hasFlagged(1500)).toBe(true);
  });
});

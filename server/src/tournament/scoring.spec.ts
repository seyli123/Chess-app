import { scoreGame, isOnFire, type ScoreState } from './scoring';

const fresh: ScoreState = { streak: 0, bestStreak: 0 };

describe('arena scoring', () => {
  it('awards 2 for a win, 1 for a draw, 0 for a loss', () => {
    expect(scoreGame(fresh, 'WIN').points).toBe(2);
    expect(scoreGame(fresh, 'DRAW').points).toBe(1);
    expect(scoreGame(fresh, 'LOSS').points).toBe(0);
  });

  it('increments the streak on each win and tracks the best', () => {
    let s: ScoreState = fresh;
    s = scoreGame(s, 'WIN'); // streak 1
    expect(s.streak).toBe(1);
    s = scoreGame(s, 'WIN'); // streak 2
    expect(s.streak).toBe(2);
    expect(s.bestStreak).toBe(2);
  });

  it('doubles wins only once on fire (third consecutive win onward)', () => {
    let s: ScoreState = fresh;
    expect(scoreGame(s, 'WIN').points).toBe(2); // 1st win: normal
    s = scoreGame(s, 'WIN'); // streak 1
    expect(scoreGame(s, 'WIN').points).toBe(2); // 2nd win: still normal
    s = scoreGame(s, 'WIN'); // streak 2 -> now on fire
    expect(scoreGame(s, 'WIN').points).toBe(4); // 3rd win: double
  });

  it('keeps doubling for a sustained streak', () => {
    let s: ScoreState = fresh;
    s = scoreGame(s, 'WIN');
    s = scoreGame(s, 'WIN'); // on fire now
    const third = scoreGame(s, 'WIN');
    expect(third.points).toBe(4);
    const fourth = scoreGame(third, 'WIN');
    expect(fourth.points).toBe(4);
    expect(fourth.bestStreak).toBe(4);
  });

  it('resets the streak on a draw or loss but preserves bestStreak', () => {
    let s: ScoreState = fresh;
    s = scoreGame(s, 'WIN');
    s = scoreGame(s, 'WIN');
    s = scoreGame(s, 'WIN'); // bestStreak 3
    const drawn = scoreGame(s, 'DRAW');
    expect(drawn.streak).toBe(0);
    expect(drawn.bestStreak).toBe(3);
    // next win after the reset is back to normal value
    expect(scoreGame(drawn, 'WIN').points).toBe(2);

    const lost = scoreGame(s, 'LOSS');
    expect(lost.streak).toBe(0);
    expect(lost.bestStreak).toBe(3);
  });

  it('reports on-fire status from the streak length', () => {
    expect(isOnFire(0)).toBe(false);
    expect(isOnFire(1)).toBe(false);
    expect(isOnFire(2)).toBe(true);
    expect(isOnFire(5)).toBe(true);
  });
});

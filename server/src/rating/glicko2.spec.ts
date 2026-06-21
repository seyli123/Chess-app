import { updateGlicko } from './glicko2';

describe('Glicko-2', () => {
  const base = { rating: 1500, deviation: 200, volatility: 0.06 };

  it('raises rating after a win and lowers RD with games', () => {
    const after = updateGlicko(base, [{ rating: 1500, deviation: 200, score: 1 }]);
    expect(after.rating).toBeGreaterThan(1500);
    expect(after.deviation).toBeLessThan(base.deviation);
  });

  it('lowers rating after a loss', () => {
    const after = updateGlicko(base, [{ rating: 1500, deviation: 200, score: 0 }]);
    expect(after.rating).toBeLessThan(1500);
  });

  it('barely moves rating for a draw vs equal opponent', () => {
    const after = updateGlicko(base, [{ rating: 1500, deviation: 200, score: 0.5 }]);
    expect(Math.abs(after.rating - 1500)).toBeLessThan(1);
  });

  it('matches the reference paper example within tolerance', () => {
    // Glickman's worked example: player (1500, 200, 0.06) vs three opponents.
    const after = updateGlicko(base, [
      { rating: 1400, deviation: 30, score: 1 },
      { rating: 1550, deviation: 100, score: 0 },
      { rating: 1700, deviation: 300, score: 0 },
    ]);
    expect(after.rating).toBeCloseTo(1464.05, 0);
    expect(after.deviation).toBeCloseTo(151.52, 0);
    expect(after.volatility).toBeCloseTo(0.05999, 3);
  });

  it('only inflates RD when no games are played', () => {
    const after = updateGlicko(base, []);
    expect(after.rating).toBe(1500);
    expect(after.deviation).toBeGreaterThan(base.deviation);
  });
});

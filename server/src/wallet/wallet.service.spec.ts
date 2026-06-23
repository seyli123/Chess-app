import { platformFee } from './wallet.service';

describe('platformFee (integer-floor)', () => {
  it('is zero for non-positive pots or fees', () => {
    expect(platformFee(0n, 100)).toBe(0n);
    expect(platformFee(200n, 0)).toBe(0n);
    expect(platformFee(-50n, 100)).toBe(0n);
  });

  it('applies the default 1% fee at the wager cap', () => {
    // Default PLATFORM_FEE_BPS = 100 (1%). 200 * 100 / 10000 = 2.
    expect(platformFee(200n, 100)).toBe(2n); // 1% of a 200 pot
    expect(platformFee(100n, 100)).toBe(1n); // 1% of a 100 pot
  });

  it('floors sub-token fees to zero', () => {
    // 200 * 1 / 10000 = 0.02 -> 0 (0.01% on a tiny pot)
    expect(platformFee(200n, 1)).toBe(0n);
  });

  it('computes whole-token fees correctly at other rates', () => {
    expect(platformFee(10_000n, 1)).toBe(1n); // 0.01% of 10000
    expect(platformFee(1_000_000n, 10)).toBe(1000n); // 0.1% of 1,000,000
  });

  it('floors fractional results down', () => {
    // 12345 * 10 / 10000 = 12.345 -> 12
    expect(platformFee(12_345n, 10)).toBe(12n);
  });
});

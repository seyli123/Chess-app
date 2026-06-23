export const config = {
  port: parseInt(process.env.PORT ?? '3000', 10),
  // CORS origin: pin it by setting WEB_ORIGIN (e.g. a production domain).
  // When unset, reflect the request origin (`true`) so dynamic hosts like
  // GitHub Codespaces forwarded URLs work without configuration.
  corsOrigin: (process.env.WEB_ORIGIN as string | undefined) || true,
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret',
    accessTtl: process.env.ACCESS_TTL ?? '15m',
    refreshTtl: process.env.REFRESH_TTL ?? '30d',
  },
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  wallet: {
    // Tokens credited automatically on signup.
    signupGrant: BigInt(process.env.SIGNUP_GRANT ?? '1000'),
    // Platform fee in basis points. 100 = 1%, 10 = 0.1%, 1 = 0.01%.
    // NOTE: integer (floor) math — at small pots a 1 bps fee rounds to 0.
    platformFeeBps: parseInt(process.env.PLATFORM_FEE_BPS ?? '1', 10),
    // Hard cap on the per-game wager (tokens).
    maxWager: BigInt(process.env.MAX_WAGER ?? '100'),
    faucet: {
      // Only claimable when balance is below this, at most once per cooldown.
      threshold: BigInt(process.env.FAUCET_THRESHOLD ?? '100'),
      amount: BigInt(process.env.FAUCET_AMOUNT ?? '500'),
      cooldownMs: parseInt(process.env.FAUCET_COOLDOWN_MS ?? String(24 * 3600 * 1000), 10),
    },
  },
} as const;

# Chess Platform (Play-Money Edition)

A full-stack, real-time chess platform in the style of Lichess/Chess.com: rated
play, matchmaking, server-authoritative gameplay, and a **play-money** token
layer (no real currency, ever, in this version).

> **Current scope: gameplay slice.** This repository currently implements
> authentication, the server-authoritative real-time game engine (clocks,
> matchmaking, full chess rules), and the Glicko-2 rating system. The wallet /
> wagering layer is **designed into the schema but not yet implemented** — see
> [Roadmap](#roadmap) and [Plugging in a wallet / real-money provider](#plugging-in-a-wallet--real-money-provider-later).

## Tech Stack

| Layer      | Choice                                                            |
| ---------- | ---------------------------------------------------------------- |
| Frontend   | React + TypeScript, Vite, Tailwind, `chessground`, `chess.js`    |
| Backend    | Node.js + TypeScript, **NestJS**, Socket.IO                      |
| Database   | PostgreSQL via Prisma                                            |
| Cache/RT   | Redis (matchmaking queue, pub/sub)                               |
| Auth       | JWT access + refresh tokens, Argon2 hashing, Google OAuth (stub) |

## Monorepo layout

```
chess-app/
├── docker-compose.yml         # postgres + redis + api + web
├── packages/shared/           # shared TS types, Socket.IO event contracts
├── server/                    # NestJS API + WebSocket gateways + Prisma
│   ├── prisma/schema.prisma
│   └── src/{auth,users,game,matchmaking,rating,common,config}
└── web/                       # React + Vite client
```

The server modules map 1:1 onto the brief's required separation:
`auth`, `users`, `game`, `matchmaking`, `rating` — plus `wallet`/`ledger`
(reserved; see roadmap).

## Getting started

### With Docker (recommended)

```bash
cp .env.example .env
docker compose up --build
# web  -> http://localhost:5173
# api  -> http://localhost:3000
```

### Local (without Docker)

You need Postgres and Redis running locally.

```bash
# 1. server
cd server
cp ../.env.example .env
npm install
npx prisma migrate dev      # creates tables
npm run seed                # house/system accounts + dev users
npm run start:dev           # http://localhost:3000

# 2. web (separate terminal)
cd web
npm install
npm run dev                 # http://localhost:5173
```

## Environment variables

See [`.env.example`](.env.example). Key ones:

| Var                  | Meaning                                              |
| -------------------- | --------------------------------------------------- |
| `DATABASE_URL`       | Postgres connection string                          |
| `REDIS_URL`          | Redis connection string                             |
| `JWT_ACCESS_SECRET`  | Signing secret for short-lived access tokens        |
| `JWT_REFRESH_SECRET` | Signing secret for refresh tokens                   |
| `ACCESS_TTL`         | Access token lifetime (e.g. `15m`)                  |
| `REFRESH_TTL`        | Refresh token lifetime (e.g. `30d`)                 |
| `GOOGLE_CLIENT_ID`   | Google OAuth client id (optional in this slice)     |
| `SIGNUP_GRANT`       | Tokens credited on signup (wallet phase)            |
| `PLATFORM_FEE_BPS`   | Platform fee in basis points (see below)            |

## Architecture notes

- **Server-authoritative everything.** Moves are validated on the server with
  `chess.js`; the client never decides legality. Clocks are owned by the server
  (`game/clock`), with the client only *rendering* time and the server being the
  single source of truth, including timeout detection.
- **Real-time** via Socket.IO. A `/game` namespace handles move/resign/draw and
  spectator streams; a `/matchmaking` namespace handles the quick-pairing queue.
- **Active game state** lives in an in-process `GameManager` for this slice (one
  API instance). Redis is already wired for the matchmaking queue and is the
  intended home for active-game/clock state when scaling horizontally.
- **Rating:** Glicko-2, computed per time-control **category** (Bullet / Blitz /
  Rapid) and applied atomically on game completion inside a DB transaction.

## Tokens, fees & the money model

- All tokens are **play-money**. There are **no deposits or withdrawals** and no
  payment processor anywhere in this codebase.
- Balances are stored as **integers** (`BigInt`, smallest unit) — never floats.
- **Platform fee** is configured in **one place**: `PLATFORM_FEE_BPS` (basis
  points). Per project decision the default is **0.1% = `10` bps**.
  - To change the rake, edit that single env var / `config` constant.
  - Reference: `1%` = `100` bps, `0.1%` = `10` bps, `0.01%` = `1` bps.
- The ledger is designed as **double-entry**: every movement is a balanced
  transaction (debits + credits sum to zero) across user/house/escrow/mint
  wallets, so balances are always reconcilable from the postings.

## Plugging in a wallet / real-money provider (later)

The schema already contains `Wallet`, `LedgerTransaction`, `LedgerEntry`, and
`Escrow`. The intended seam:

1. Define a `WalletProvider` interface in `server/src/wallet/` with methods like
   `credit`, `debit`, `escrow`, `settle`, `refund` — all of which write
   double-entry `LedgerEntry` rows inside a single Prisma transaction using
   `SELECT ... FOR UPDATE` row locks on the involved wallets.
2. Implement `PlayMoneyWalletProvider` (the only impl now): minting comes from a
   system `MINT` wallet (signup grant / faucet / admin grant).
3. A future real-money on-ramp implements the same interface behind a
   `PaymentProvider` (Stripe/crypto) that maps deposits → credits and
   withdrawals → debits. **Game and wagering logic depend only on the
   interface**, so no game code changes when the provider swaps.

## Roadmap

- [x] Auth (register/login/refresh, Argon2, JWT)
- [x] Server-authoritative game engine + clocks + Socket.IO
- [x] Matchmaking (quick pairing by time control + rating range)
- [x] Glicko-2 rating per category
- [ ] Wallet + double-entry ledger (play-money)
- [ ] Wagering escrow / payout / fee cycle
- [ ] Arena tournaments
- [ ] Anti-abuse (collusion, abort/stall, rating manipulation)
- [ ] Full test suite (heavy on ledger/escrow concurrency)

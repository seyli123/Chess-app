import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, WalletType, LedgerTxType, GameResult } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { config } from '../config/config';

/** One leg of a double-entry transaction. Credits are +, debits are -. */
interface Posting {
  walletId: string;
  amount: bigint;
}

/**
 * Platform fee on a pot, in integer tokens (floored). Pure so it can be unit
 * tested. NOTE: at small pots a sub-1-token fee floors to 0.
 */
export function platformFee(pot: bigint, feeBps: number): bigint {
  if (pot <= 0n || feeBps <= 0) return 0n;
  return (pot * BigInt(feeBps)) / 10000n;
}

/**
 * Play-money wallet + double-entry ledger.
 *
 * Every value movement is an immutable, balanced `LedgerTransaction` whose
 * `LedgerEntry` rows sum to zero across the involved wallets; the cached
 * `Wallet.balance` is updated in the same DB transaction so it always
 * reconciles with the entries. All balance-changing operations take
 * `SELECT … FOR UPDATE` row locks (in a stable order) to prevent double-spends
 * under concurrency.
 *
 * Amounts are integer tokens (BigInt) — never floats.
 */
@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- wallet resolution ----

  private async getOrCreateUserWallet(tx: Prisma.TransactionClient, userId: string) {
    const existing = await tx.wallet.findUnique({ where: { userId } });
    if (existing) return existing;
    return tx.wallet.create({ data: { userId, type: WalletType.USER } });
  }

  private async getOrCreateSystemWallet(tx: Prisma.TransactionClient, type: WalletType) {
    const existing = await tx.wallet.findFirst({ where: { type, userId: null } });
    if (existing) return existing;
    return tx.wallet.create({ data: { type, userId: null } });
  }

  /** Take row locks on the given wallets in a stable order (deadlock-safe). */
  private async lock(tx: Prisma.TransactionClient, walletIds: string[]) {
    const ids = [...new Set(walletIds)].sort();
    if (!ids.length) return;
    await tx.$queryRaw`SELECT id FROM "Wallet" WHERE id IN (${Prisma.join(ids)}) FOR UPDATE`;
  }

  /**
   * Write a balanced transaction: persist the ledger rows and apply each
   * posting to its wallet's cached balance. Callers must already hold locks on
   * every wallet referenced. Throws if the postings don't sum to zero.
   */
  private async post(
    tx: Prisma.TransactionClient,
    type: LedgerTxType,
    ref: { refType?: string; refId?: string },
    postings: Posting[],
  ) {
    const sum = postings.reduce((s, p) => s + p.amount, 0n);
    if (sum !== 0n) throw new Error(`unbalanced ledger transaction (${sum})`);
    const txRow = await tx.ledgerTransaction.create({
      data: { type, refType: ref.refType ?? null, refId: ref.refId ?? null },
    });
    for (const p of postings) {
      await tx.ledgerEntry.create({
        data: { transactionId: txRow.id, walletId: p.walletId, amount: p.amount },
      });
      await tx.wallet.update({
        where: { id: p.walletId },
        data: { balance: { increment: p.amount } },
      });
    }
    return txRow;
  }

  // ---- public reads ----

  async getBalance(userId: string): Promise<bigint> {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    return wallet?.balance ?? 0n;
  }

  /** Current balance + the user's full ledger (most recent first). */
  async getStatement(userId: string) {
    const wallet = await this.prisma.$transaction((tx) => this.getOrCreateUserWallet(tx, userId));
    const entries = await this.prisma.ledgerEntry.findMany({
      where: { walletId: wallet.id },
      include: { transaction: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return {
      balance: wallet.balance,
      currency: wallet.currency,
      ledger: entries.map((e) => ({
        id: e.id,
        amount: e.amount,
        type: e.transaction.type,
        refType: e.transaction.refType,
        refId: e.transaction.refId,
        createdAt: e.createdAt,
      })),
    };
  }

  async canClaimFaucet(userId: string): Promise<boolean> {
    const balance = await this.getBalance(userId);
    if (balance >= config.wallet.faucet.threshold) return false;
    return !(await this.faucetOnCooldown(userId));
  }

  private async faucetOnCooldown(userId: string): Promise<boolean> {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) return false;
    const last = await this.prisma.ledgerEntry.findFirst({
      where: { walletId: wallet.id, transaction: { type: LedgerTxType.FAUCET } },
      orderBy: { createdAt: 'desc' },
    });
    if (!last) return false;
    return last.createdAt.getTime() > Date.now() - config.wallet.faucet.cooldownMs;
  }

  // ---- mutations ----

  /** Credit the signup grant from the MINT wallet. Idempotency is the caller's. */
  async grantSignup(userId: string): Promise<void> {
    const amount = config.wallet.signupGrant;
    if (amount <= 0n) return;
    await this.prisma.$transaction(async (tx) => {
      const user = await this.getOrCreateUserWallet(tx, userId);
      const mint = await this.getOrCreateSystemWallet(tx, WalletType.MINT);
      await this.lock(tx, [user.id, mint.id]);
      await this.post(tx, LedgerTxType.SIGNUP_GRANT, { refType: 'user', refId: userId }, [
        { walletId: mint.id, amount: -amount },
        { walletId: user.id, amount },
      ]);
    });
  }

  /** Top-up faucet: 500 tokens if below the threshold and off cooldown. */
  async claimFaucet(userId: string): Promise<{ balance: bigint }> {
    const { threshold, amount, cooldownMs } = config.wallet.faucet;
    return this.prisma.$transaction(async (tx) => {
      const user = await this.getOrCreateUserWallet(tx, userId);
      const mint = await this.getOrCreateSystemWallet(tx, WalletType.MINT);
      await this.lock(tx, [user.id, mint.id]);
      const fresh = await tx.wallet.findUniqueOrThrow({ where: { id: user.id } });
      if (fresh.balance >= threshold) {
        throw new BadRequestException(`Faucet is only available below ${threshold} tokens`);
      }
      const last = await tx.ledgerEntry.findFirst({
        where: { walletId: user.id, transaction: { type: LedgerTxType.FAUCET } },
        orderBy: { createdAt: 'desc' },
      });
      if (last && last.createdAt.getTime() > Date.now() - cooldownMs) {
        throw new BadRequestException('Faucet already claimed — try again later');
      }
      await this.post(tx, LedgerTxType.FAUCET, { refType: 'user', refId: userId }, [
        { walletId: mint.id, amount: -amount },
        { walletId: user.id, amount },
      ]);
      const updated = await tx.wallet.findUniqueOrThrow({ where: { id: user.id } });
      return { balance: updated.balance };
    });
  }

  /**
   * Lock both players' stakes into escrow at game start. Debits each player and
   * credits the ESCROW wallet, then records the Escrow row. Throws
   * BadRequestException if either player can't cover the wager.
   */
  async lockEscrow(params: {
    gameId: string;
    whiteId: string;
    blackId: string;
    amount: bigint;
  }): Promise<void> {
    const { gameId, whiteId, blackId, amount } = params;
    if (amount <= 0n) return;
    await this.prisma.$transaction(async (tx) => {
      const white = await this.getOrCreateUserWallet(tx, whiteId);
      const black = await this.getOrCreateUserWallet(tx, blackId);
      const escrow = await this.getOrCreateSystemWallet(tx, WalletType.ESCROW);
      await this.lock(tx, [white.id, black.id, escrow.id]);
      const [wf, bf] = await Promise.all([
        tx.wallet.findUniqueOrThrow({ where: { id: white.id } }),
        tx.wallet.findUniqueOrThrow({ where: { id: black.id } }),
      ]);
      if (wf.balance < amount || bf.balance < amount) {
        throw new BadRequestException('Insufficient balance for wager');
      }
      await this.post(tx, LedgerTxType.ESCROW_LOCK, { refType: 'game', refId: gameId }, [
        { walletId: white.id, amount: -amount },
        { walletId: black.id, amount: -amount },
        { walletId: escrow.id, amount: amount * 2n },
      ]);
      await tx.escrow.create({
        data: {
          gameId,
          whiteStake: amount,
          blackStake: amount,
          feeBps: config.wallet.platformFeeBps,
          status: 'LOCKED',
        },
      });
    });
  }

  /**
   * Settle a finished game's escrow inside the caller's transaction (so it
   * commits atomically with the game result). Decisive games pay the pot to the
   * winner minus the platform fee (which accrues to HOUSE); draws and aborts
   * refund both stakes. No-op when there is no locked escrow.
   */
  async settleEscrow(
    tx: Prisma.TransactionClient,
    gameId: string,
    result: GameResult,
  ): Promise<void> {
    const escrow = await tx.escrow.findUnique({ where: { gameId } });
    if (!escrow || escrow.status !== 'LOCKED') return;
    const game = await tx.game.findUniqueOrThrow({ where: { id: gameId } });

    const escrowW = await this.getOrCreateSystemWallet(tx, WalletType.ESCROW);
    const houseW = await this.getOrCreateSystemWallet(tx, WalletType.HOUSE);
    const whiteW = await this.getOrCreateUserWallet(tx, game.whiteId);
    const blackW = await this.getOrCreateUserWallet(tx, game.blackId);
    const pot = escrow.whiteStake + escrow.blackStake;
    await this.lock(tx, [escrowW.id, houseW.id, whiteW.id, blackW.id]);

    if (result === 'DRAW') {
      await this.post(tx, LedgerTxType.REFUND, { refType: 'game', refId: gameId }, [
        { walletId: escrowW.id, amount: -pot },
        { walletId: whiteW.id, amount: escrow.whiteStake },
        { walletId: blackW.id, amount: escrow.blackStake },
      ]);
    } else {
      const winnerW = result === 'WHITE_WINS' ? whiteW : blackW;
      // Integer floor fee. Pay the full pot to the winner, then take the fee as
      // a separate balanced posting so both legs are explicit in the ledger.
      const fee = platformFee(pot, escrow.feeBps);
      await this.post(tx, LedgerTxType.PAYOUT, { refType: 'game', refId: gameId }, [
        { walletId: escrowW.id, amount: -pot },
        { walletId: winnerW.id, amount: pot },
      ]);
      if (fee > 0n) {
        await this.post(tx, LedgerTxType.FEE, { refType: 'game', refId: gameId }, [
          { walletId: winnerW.id, amount: -fee },
          { walletId: houseW.id, amount: fee },
        ]);
      }
    }
    await tx.escrow.update({
      where: { gameId },
      data: { status: result === 'DRAW' ? 'REFUNDED' : 'SETTLED', settledAt: new Date() },
    });
  }
}

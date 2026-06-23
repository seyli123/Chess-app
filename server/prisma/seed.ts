import { PrismaClient, WalletType, LedgerTxType } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const SIGNUP_GRANT = BigInt(process.env.SIGNUP_GRANT ?? '1000');

/** Mint the signup grant to a user via a balanced double-entry transaction. */
async function grantSignup(userId: string) {
  const wallet = await prisma.wallet.upsert({
    where: { userId },
    create: { userId, type: WalletType.USER },
    update: {},
  });
  // Idempotent: skip if this user already received a signup grant.
  const already = await prisma.ledgerEntry.findFirst({
    where: { walletId: wallet.id, transaction: { type: LedgerTxType.SIGNUP_GRANT } },
  });
  if (already) return;
  const mint = await prisma.wallet.findFirstOrThrow({
    where: { type: WalletType.MINT, userId: null },
  });
  await prisma.$transaction(async (tx) => {
    const ledgerTx = await tx.ledgerTransaction.create({
      data: { type: LedgerTxType.SIGNUP_GRANT, refType: 'user', refId: userId },
    });
    await tx.ledgerEntry.createMany({
      data: [
        { transactionId: ledgerTx.id, walletId: mint.id, amount: -SIGNUP_GRANT },
        { transactionId: ledgerTx.id, walletId: wallet.id, amount: SIGNUP_GRANT },
      ],
    });
    await tx.wallet.update({
      where: { id: mint.id },
      data: { balance: { decrement: SIGNUP_GRANT } },
    });
    await tx.wallet.update({
      where: { id: wallet.id },
      data: { balance: { increment: SIGNUP_GRANT } },
    });
  });
}

async function main() {
  // System wallets for the double-entry ledger: HOUSE / MINT / ESCROW.
  for (const type of [WalletType.HOUSE, WalletType.MINT, WalletType.ESCROW]) {
    const existing = await prisma.wallet.findFirst({ where: { type, userId: null } });
    if (!existing) {
      await prisma.wallet.create({ data: { type, userId: null } });
    }
  }

  // Dev users for local play-testing, each credited the signup grant.
  const passwordHash = await argon2.hash('password123');
  for (const username of ['alice', 'bob']) {
    const user = await prisma.user.upsert({
      where: { username },
      create: { username, email: `${username}@example.com`, passwordHash },
      update: {},
    });
    await grantSignup(user.id);
  }

  console.log(
    `Seed complete: system wallets + dev users (alice/bob, password123) with ${SIGNUP_GRANT} tokens`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

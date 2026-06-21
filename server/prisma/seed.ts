import { PrismaClient, WalletType } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  // Reserved system wallets for the upcoming double-entry ledger. Created now so
  // the wallet phase has its HOUSE / MINT / ESCROW accounts ready.
  for (const type of [WalletType.HOUSE, WalletType.MINT, WalletType.ESCROW]) {
    const existing = await prisma.wallet.findFirst({ where: { type, userId: null } });
    if (!existing) {
      await prisma.wallet.create({ data: { type, userId: null } });
    }
  }

  // Dev users for local play-testing.
  const passwordHash = await argon2.hash('password123');
  for (const username of ['alice', 'bob']) {
    await prisma.user.upsert({
      where: { username },
      create: { username, email: `${username}@example.com`, passwordHash },
      update: {},
    });
  }

  console.log('Seed complete: system wallets + dev users (alice/bob, password123)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

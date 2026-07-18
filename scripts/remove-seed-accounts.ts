/**
 * One-off cleanup: delete the synthetic "@riftcompare.seed" persona accounts that
 * scripts/seed-forum.ts (the forum autoseeder, now removed) created to populate the
 * forum. The forum and the autoseeder are gone, so these bot accounts are dead data.
 *
 * Safe to run once against production and then delete/forget — nothing creates
 * @riftcompare.seed accounts anymore.
 *
 * Usage: npx tsx scripts/remove-seed-accounts.ts
 */
import { prisma } from "../src/lib/db";

async function main() {
  const { count } = await prisma.user.deleteMany({
    where: { email: { endsWith: "@riftcompare.seed" } },
  });
  console.log(`remove-seed-accounts: deleted ${count} seed persona account(s).`);
}

main()
  .catch((e) => {
    console.error("remove-seed-accounts failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

/**
 * User/Premium census — read-only. Reports the real (non-seed) user count and how
 * many active Premium accounts exist (paid or comped), so signup/pricing decisions
 * can be made from real numbers instead of guessing.
 *
 * `earlyPremiumGranted` is still counted because the COLUMN still exists and marks
 * the accounts that received the retired early-adopter comp — useful history when
 * reading churn, even though nothing grants it any more.
 *
 * Usage: npx tsx scripts/audit-users.ts
 */
import { prisma } from "../src/lib/db";
import { NOT_SEED_WHERE } from "../src/lib/premium";

async function main() {
  const totalReal = await prisma.user.count({ where: NOT_SEED_WHERE });
  const earlyGranted = await prisma.user.count({ where: { AND: [NOT_SEED_WHERE, { earlyPremiumGranted: true }] } });
  const activePremium = await prisma.user.count({
    where: { AND: [NOT_SEED_WHERE, { premiumUntil: { gt: new Date() } }] },
  });
  const last7d = await prisma.user.count({
    where: { AND: [NOT_SEED_WHERE, { createdAt: { gte: new Date(Date.now() - 7 * 86400_000) } }] },
  });

  console.log(`Real (non-seed) users: ${totalReal}`);
  console.log(`Held the retired early-adopter comp: ${earlyGranted}`);
  console.log(`Currently active Premium (paid + comped): ${activePremium}`);
  console.log(`New real signups in the last 7 days: ${last7d}`);
}

main()
  .catch((e) => {
    console.error("audit-users failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

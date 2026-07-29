/**
 * User/Premium census — read-only. Reports real (non-seed) user count, how many
 * have already been granted the early-adopter Premium comp, and how many active
 * Premium accounts exist (paid or comped), so a signup-promo decision can be made
 * from real numbers instead of guessing.
 *
 * Usage: npx tsx scripts/audit-users.ts
 */
import { prisma } from "../src/lib/db";
import { NOT_SEED_WHERE, EARLY_PREMIUM_LIMIT, EARLY_PREMIUM_DAYS } from "../src/lib/premium";

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
  console.log(`Early-adopter promo granted: ${earlyGranted} (limit ${EARLY_PREMIUM_LIMIT}, ${EARLY_PREMIUM_DAYS} days each)`);
  console.log(`Remaining early-adopter slots: ${Math.max(0, EARLY_PREMIUM_LIMIT - totalReal)}`);
  console.log(`Currently active Premium (paid + comped): ${activePremium}`);
  console.log(`New real signups in the last 7 days: ${last7d}`);
}

main()
  .catch((e) => {
    console.error("audit-users failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

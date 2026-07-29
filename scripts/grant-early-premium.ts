/**
 * Backfill the early-adopter Premium comp to the first EARLY_PREMIUM_LIMIT accounts
 * (by registration date). Idempotent — each account is granted once (guarded by the
 * earlyPremiumGranted flag), so this is safe to run repeatedly (e.g. on every deploy)
 * and will simply pick up any newly-registered early users that haven't been granted.
 *
 * Controlled by env: EARLY_PREMIUM_DAYS (default 7, 0 = off), EARLY_PREMIUM_LIMIT
 * (default 300). Signups already get granted at registration; this covers accounts
 * created before the promo shipped.
 *
 * Usage: npx tsx scripts/grant-early-premium.ts
 */
import { prisma } from "../src/lib/db";
import {
  grantEarlyAdopterPremium,
  earlyPremiumPromoActive,
  EARLY_PREMIUM_LIMIT,
  EARLY_PREMIUM_DAYS,
  NOT_SEED_WHERE,
} from "../src/lib/premium";

async function main() {
  if (!earlyPremiumPromoActive()) {
    console.log("early-premium: promo off (EARLY_PREMIUM_DAYS=0) — nothing to do.");
    return;
  }
  const users = await prisma.user.findMany({
    where: NOT_SEED_WHERE, // real users only — seed accounts never get the comp
    orderBy: { createdAt: "asc" },
    take: EARLY_PREMIUM_LIMIT,
    select: { id: true },
  });
  let granted = 0;
  for (const u of users) {
    if (await grantEarlyAdopterPremium(u.id)) granted++;
  }
  console.log(
    `early-premium: ${granted} newly granted ${EARLY_PREMIUM_DAYS} days (of the first ${users.length} accounts).`,
  );
}

main()
  .catch((e) => {
    console.error("grant-early-premium failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

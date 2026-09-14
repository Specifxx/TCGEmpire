/**
 * ONE-OFF (2026-09-14): pin every current Plus subscriber to a Premium FLOOR, so
 * moving ad-free from Plus to Premium takes nothing away from anyone who already
 * paid for it.
 *
 * WHY A FLOOR AND NOT A COLUMN OF ITS OWN. `premiumTierFloor` already exists for
 * exactly this shape of problem — it was built on 2026-09-11 to grandfather the
 * August $4.99 cohort — and `effectiveTier()` applies it at READ time as
 * max(billed tier, floor). So billing keeps writing the true tier, renewals keep
 * working, and there is no second copy of the truth to drift. Adding an
 * `adFreeFloor` column for one migration would be a second mechanism doing the
 * same job.
 *
 * THE TRADE-OFF, STATED PLAINLY: a floor raises the WHOLE tier, so these accounts
 * also gain the four pro tools they did not buy. That is deliberate and generous.
 * The population is a handful of accounts, the alternative is either taking a
 * paid-for benefit away or building a parallel entitlement path, and "you keep
 * what you bought, plus a bit more" is the version we can explain without
 * embarrassment. See DECISIONS.md, 2026-09-14.
 *
 * Read-only unless APPLY=1 — same convention as audit-premium-vs-stripe.ts.
 * Idempotent: an account already floored at premium is skipped, so a second run
 * changes nothing.
 *
 * Usage:
 *   npx tsx scripts/grandfather-plus-adfree.ts          # report only
 *   APPLY=1 npx tsx scripts/grandfather-plus-adfree.ts  # write the floors
 */
import { prisma } from "../src/lib/db";
import { effectiveTier, NOT_SEED_WHERE } from "../src/lib/premium";

const APPLY = process.env.APPLY === "1";

async function main() {
  // Everyone currently entitled. The tier decision is made in code via
  // effectiveTier() rather than in the query, so this script and the runtime
  // can never disagree about what "is on Plus" means.
  const entitled = await prisma.user.findMany({
    where: { AND: [NOT_SEED_WHERE, { premiumUntil: { gt: new Date() } }] },
    select: { id: true, premiumTier: true, premiumTierFloor: true, premiumUntil: true },
  });

  const onPlus = entitled.filter((u) => effectiveTier(u) === "plus");
  console.log(`Entitled accounts: ${entitled.length}`);
  console.log(`Currently on Plus (would lose ad-free): ${onPlus.length}`);
  if (onPlus.length === 0) {
    console.log("Nothing to do.");
    return;
  }
  // Ids only — this runs in CI logs, so no emails or names.
  for (const u of onPlus) {
    console.log(`  ${u.id} · billed=${u.premiumTier ?? "(none)"} floor=${u.premiumTierFloor ?? "(none)"} until=${u.premiumUntil?.toISOString() ?? "?"}`);
  }

  if (!APPLY) {
    console.log(`\nDRY RUN — set APPLY=1 to write ${onPlus.length} floor(s).`);
    return;
  }

  let written = 0;
  for (const u of onPlus) {
    await prisma.user.update({ where: { id: u.id }, data: { premiumTierFloor: "premium" } });
    written++;
  }
  console.log(`\nFloored ${written} account(s) to premium.`);
}

main()
  .catch((e) => {
    console.error("grandfather-plus-adfree failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

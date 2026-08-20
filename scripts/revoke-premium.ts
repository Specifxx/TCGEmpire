/**
 * Remove Premium from ONE account, by email. For testing the non-Premium
 * experience on a real account without creating a throwaway one.
 *
 * Reports the account's full Premium-relevant state BEFORE and AFTER, because
 * "is this account Premium?" has more than one answer and clearing the obvious
 * field does not always change it:
 *
 *   • premiumUntil       — the paid/comped period. This is what gets cleared.
 *   • isAdmin            — isPremium() in lib/premium.ts returns TRUE for any
 *                          admin regardless of premiumUntil, so an ADMIN ACCOUNT
 *                          STAYS PREMIUM no matter what this script does. It is
 *                          reported loudly and deliberately NOT modified —
 *                          silently dropping someone's admin rights to satisfy a
 *                          "remove premium" request would be a far bigger change
 *                          than the one that was asked for.
 *   • stripeCustomerId   — if a subscription is still ACTIVE at Stripe, its next
 *                          webhook re-stamps premiumUntil and Premium returns on
 *                          its own. Reported so that surprise is visible up front.
 *   • trialStartedAt     — one free trial per account. NOT cleared by default:
 *                          clearing it hands the account a second free trial,
 *                          which is a different request. Pass RESET_TRIAL=1 to
 *                          also clear it (and trialReminderSentAt with it).
 *   • earlyPremiumGranted — the retired early-adopter comp flag. Cleared
 *                          alongside premiumUntil so the comp cannot be read as
 *                          still held.
 *
 * DRY RUN by default in spirit: pass DRY_RUN=1 to report without writing.
 *
 * Usage: TARGET_EMAIL=someone@example.com npx tsx scripts/revoke-premium.ts
 */
import { prisma } from "../src/lib/db";
import { isPremium } from "../src/lib/premium";

const EMAIL = (process.env.TARGET_EMAIL ?? "").trim().toLowerCase();
const DRY = process.env.DRY_RUN === "1";
const RESET_TRIAL = process.env.RESET_TRIAL === "1";

function show(label: string, u: {
  premiumUntil: Date | null;
  isAdmin: boolean;
  earlyPremiumGranted: boolean;
  trialStartedAt: Date | null;
  stripeCustomerId: string | null;
}) {
  console.log(`\n== ${label} ==`);
  console.log(`  premiumUntil        : ${u.premiumUntil ? u.premiumUntil.toISOString() : "null"}`);
  console.log(`  isAdmin             : ${u.isAdmin}`);
  console.log(`  earlyPremiumGranted : ${u.earlyPremiumGranted}`);
  console.log(`  trialStartedAt      : ${u.trialStartedAt ? u.trialStartedAt.toISOString() : "null"}`);
  console.log(`  stripeCustomerId    : ${u.stripeCustomerId ? "set" : "null"}`);
  console.log(`  → isPremium()       : ${isPremium(u)}`);
}

async function main() {
  if (!EMAIL) {
    console.error("::error::TARGET_EMAIL is required (the account to remove Premium from).");
    process.exit(1);
  }

  const select = {
    id: true,
    email: true,
    premiumUntil: true,
    isAdmin: true,
    earlyPremiumGranted: true,
    trialStartedAt: true,
    stripeCustomerId: true,
  } as const;

  const before = await prisma.user.findFirst({ where: { email: EMAIL }, select });
  if (!before) {
    console.error(`::error::no account found with email ${EMAIL} — nothing changed.`);
    process.exit(1);
  }

  console.log(`Account: ${before.email} (${before.id})`);
  show("BEFORE", before);

  if (DRY) {
    console.log("\nDRY_RUN=1 — nothing written.");
  } else {
    await prisma.user.update({
      where: { id: before.id },
      data: {
        premiumUntil: null,
        earlyPremiumGranted: false,
        ...(RESET_TRIAL ? { trialStartedAt: null, trialReminderSentAt: null } : {}),
      },
    });
    const after = await prisma.user.findUnique({ where: { id: before.id }, select });
    if (after) show("AFTER", after);
  }

  // The two ways Premium can survive this, stated plainly rather than left to be
  // rediscovered when the test shows the wrong thing.
  if (before.isAdmin) {
    console.log(
      "\n::warning::This account is an ADMIN. isPremium() returns true for admins regardless of " +
        "premiumUntil (see lib/premium.ts), so it STILL HAS FULL PREMIUM ACCESS and the paywalled " +
        "surfaces will not gate. Admin was left untouched on purpose. To test the free experience, " +
        "either use a non-admin account or ask for isAdmin to be cleared explicitly."
    );
  }
  if (before.stripeCustomerId) {
    console.log(
      "\n::warning::This account has a Stripe customer id. If the subscription is still ACTIVE, the " +
        "next renewal webhook re-stamps premiumUntil and Premium comes back by itself. Cancel it in " +
        "Stripe first if the account must stay non-Premium."
    );
  }
  if (!RESET_TRIAL && before.trialStartedAt) {
    console.log(
      "\nNote: trialStartedAt is still set, so this account cannot start another free trial. " +
        "Re-run with RESET_TRIAL=1 if you also want to test the trial-signup flow."
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

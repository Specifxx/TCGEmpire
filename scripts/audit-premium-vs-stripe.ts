/**
 * Reconcile STRIPE (who is actually paying) against the DATABASE (who actually
 * has Premium). Read-only unless FIX=1.
 *
 * WHY. The 2026-08-22 recovery restored RM8 from RM6, whose snapshot predates
 * the 2026-08-20 cutover, so every write in that ~2-day window was lost. For
 * PAYING subscribers that is the worst possible loss: they keep being charged
 * while the site treats them as free. It surfaces as a support ticket, if at
 * all — nothing in the app errors.
 *
 * Stripe is the authority here, not the database: it is the system that took the
 * money and it was never rolled back. So walk every live subscription and assert
 * the DB agrees, rather than trying to guess which rows are missing.
 *
 * For each active/trialing subscription this checks the three things that must
 * ALL hold for a subscriber to keep working (see premiumRenewed() in
 * api/marketplace/stripe/webhook):
 *
 *   1. a User row exists for the customer's email
 *   2. premiumUntil is >= the subscription's current_period_end
 *      (a shortfall means they paid for time the site will not honour)
 *   3. the renewal can find them: subscription.metadata.userId matches the row,
 *      or User.stripeCustomerId matches the customer
 *
 * (3) is the silent one. Both are links to a User ROW ID; if the row was lost and
 * recreated, they point at an id that no longer exists, premiumRenewed() finds
 * nobody, and its update no-ops behind a .catch(() => {}).
 *
 * FIX=1 repairs (2) and (3) — never creates a User row (an OAuth identity cannot
 * be invented; see scripts/grant-premium.ts).
 *
 * Usage:  npx tsx scripts/audit-premium-vs-stripe.ts        # report only
 *         FIX=1 npx tsx scripts/audit-premium-vs-stripe.ts  # repair
 */
import type Stripe from "stripe";
import { prisma } from "../src/lib/db";
import { stripe, stripeEnabled } from "../src/lib/stripe";

const FIX = process.env.FIX === "1";

type Problem = "no-account" | "premium-short" | "renewal-unlinked";

async function main() {
  if (!stripeEnabled()) {
    console.error("::error::STRIPE_SECRET_KEY is not set — cannot audit.");
    process.exit(1);
  }

  const subs: Stripe.Subscription[] = [];
  for (const status of ["active", "trialing", "past_due"] as const) {
    // auto-pagination: a missed subscriber is the entire failure mode here, so
    // never cap the page at Stripe's default 10.
    for await (const s of stripe().subscriptions.list({ status, limit: 100 })) subs.push(s);
  }
  console.log(`Stripe: ${subs.length} active/trialing/past_due subscription(s).\n`);

  const problems: { email: string; sub: string; kind: Problem; detail: string }[] = [];
  let ok = 0;

  for (const sub of subs) {
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    let email: string | null = null;
    try {
      const c = await stripe().customers.retrieve(customerId);
      if (!("deleted" in c && c.deleted)) email = (c.email ?? "").trim().toLowerCase() || null;
    } catch {
      /* fall through — reported as no-account below */
    }
    const periodEnd = new Date(sub.current_period_end * 1000);
    const label = email ?? customerId;

    if (!email) {
      problems.push({ email: label, sub: sub.id, kind: "no-account", detail: "Stripe customer has no email" });
      continue;
    }

    const user = await prisma.user.findFirst({
      where: { email },
      select: { id: true, premiumUntil: true, stripeCustomerId: true },
    });
    if (!user) {
      problems.push({
        email: label,
        sub: sub.id,
        kind: "no-account",
        detail: `paying (${sub.status}, through ${periodEnd.toISOString()}) but NO account exists`,
      });
      continue;
    }

    let issue = false;

    // (2) does the DB honour what they have paid for?
    const short = !user.premiumUntil || user.premiumUntil < periodEnd;
    if (short) {
      issue = true;
      problems.push({
        email: label,
        sub: sub.id,
        kind: "premium-short",
        detail: `premiumUntil=${user.premiumUntil?.toISOString() ?? "null"} < paid-through ${periodEnd.toISOString()}`,
      });
      if (FIX) {
        await prisma.user.update({ where: { id: user.id }, data: { premiumUntil: periodEnd } });
        console.log(`  FIXED ${label}: premiumUntil → ${periodEnd.toISOString()}`);
      }
    }

    // (3) can the next renewal still find them?
    const metaOk = sub.metadata?.userId === user.id;
    const custOk = user.stripeCustomerId === customerId;
    if (!metaOk || !custOk) {
      issue = true;
      problems.push({
        email: label,
        sub: sub.id,
        kind: "renewal-unlinked",
        detail: `metadata.userId=${sub.metadata?.userId ?? "unset"}${metaOk ? "" : " (MISMATCH)"}, ` +
          `User.stripeCustomerId=${user.stripeCustomerId ?? "null"}${custOk ? "" : " (MISMATCH)"}`,
      });
      if (FIX) {
        if (!metaOk) {
          await stripe().subscriptions.update(sub.id, { metadata: { ...sub.metadata, userId: user.id } });
          console.log(`  FIXED ${label}: subscription metadata.userId → ${user.id}`);
        }
        if (!custOk) {
          await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } });
          console.log(`  FIXED ${label}: User.stripeCustomerId → ${customerId}`);
        }
      }
    }

    if (!issue) ok++;
  }

  console.log(`\n${ok}/${subs.length} subscription(s) fully consistent.`);
  if (!problems.length) {
    console.log("No discrepancies. Every paying subscriber has Premium and a working renewal link.");
    return;
  }

  console.log(`\n${problems.length} discrepancy(ies):`);
  for (const p of problems) console.log(`  [${p.kind}] ${p.email} (${p.sub}) — ${p.detail}`);

  const orphans = problems.filter((p) => p.kind === "no-account");
  if (orphans.length) {
    console.log(
      `\n::warning::${orphans.length} paying customer(s) have NO account. These cannot be fixed here — ` +
        `an OAuth row carries a provider identity this script cannot invent, and a hand-made row ` +
        `collides with the real one at their next sign-in. Ask them to sign in once, then re-run.`
    );
  }
  if (!FIX) console.log("\nRead-only. Re-run with FIX=1 to repair everything except the no-account cases.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

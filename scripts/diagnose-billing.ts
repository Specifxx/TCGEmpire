/**
 * Read-only: why does this account have (or lack) Premium, per Stripe's own
 * records? Prints the DB row's billing-relevant fields, then every Stripe
 * subscription on the linked customer (all statuses, not just entitled ones)
 * with its latest invoice and — if that invoice's payment failed — the actual
 * decline reason, so "payment failed but they have Premium" can be diagnosed
 * from real data instead of guessed at.
 *
 * Never writes anything, to Stripe or the database.
 *
 * Usage: TARGET_EMAIL=someone@example.com npx tsx scripts/diagnose-billing.ts
 */
import { prisma } from "../src/lib/db";
import { stripe, stripeEnabled } from "../src/lib/stripe";
import { entitledUntilFromSubscription, periodEndFromSubscription } from "../src/lib/stripe-entitlement";
import { isPremium } from "../src/lib/premium";

const EMAIL = (process.env.TARGET_EMAIL ?? "").trim().toLowerCase();

async function main() {
  if (!EMAIL) {
    console.error("::error::TARGET_EMAIL is required.");
    process.exit(1);
  }
  if (!stripeEnabled()) {
    console.error("::error::Stripe is not configured (no STRIPE_SECRET_KEY) — can't read subscription state.");
    process.exit(1);
  }

  const user = await prisma.user.findFirst({
    where: { email: EMAIL },
    select: {
      id: true,
      email: true,
      premiumUntil: true,
      isAdmin: true,
      trialStartedAt: true,
      trialReminderSentAt: true,
      stripeCustomerId: true,
      createdAt: true,
    },
  });
  if (!user) {
    console.error(`::error::no account found with email ${EMAIL}.`);
    process.exit(1);
  }

  console.log(`Account: ${user.email} (${user.id}), created ${user.createdAt.toISOString()}`);
  console.log(`  premiumUntil      : ${user.premiumUntil ? user.premiumUntil.toISOString() : "null"}`);
  console.log(`  → isPremium() now : ${isPremium(user)}`);
  console.log(`  isAdmin           : ${user.isAdmin}`);
  console.log(`  trialStartedAt    : ${user.trialStartedAt ? user.trialStartedAt.toISOString() : "null"}`);
  console.log(`  stripeCustomerId  : ${user.stripeCustomerId ?? "null"}`);

  if (!user.stripeCustomerId) {
    console.log("\nNo Stripe customer linked to this account — premiumUntil (if set) came from a comp grant, not a subscription.");
    return;
  }

  const subs = await stripe().subscriptions.list({ customer: user.stripeCustomerId, status: "all", limit: 20 });
  console.log(`\n${subs.data.length} subscription(s) on this customer:`);

  for (const sub of subs.data) {
    const entitled = entitledUntilFromSubscription(sub);
    const periodEnd = periodEndFromSubscription(sub);
    console.log(`\n  Subscription ${sub.id}`);
    console.log(`    status              : ${sub.status}`);
    console.log(`    current_period_end  : ${periodEnd ? periodEnd.toISOString() : "n/a"}`);
    console.log(`    entitles access?    : ${entitled ? `YES, through ${entitled.toISOString()}` : "NO"}`);
    console.log(`    cancel_at_period_end: ${sub.cancel_at_period_end}`);

    const latestInvoiceId = typeof sub.latest_invoice === "string" ? sub.latest_invoice : sub.latest_invoice?.id;
    if (!latestInvoiceId) {
      console.log("    latest_invoice      : none");
      continue;
    }
    try {
      const invoice = await stripe().invoices.retrieve(latestInvoiceId, {
        expand: ["payment_intent"],
      });
      console.log(`    latest_invoice      : ${invoice.id} (status ${invoice.status})`);
      console.log(`      amount_due/paid   : ${invoice.amount_due} / ${invoice.amount_paid} ${invoice.currency}`);
      const pi = (invoice as unknown as { payment_intent?: unknown }).payment_intent;
      const piObj = pi && typeof pi !== "string" ? (pi as { status?: string; last_payment_error?: { message?: string; decline_code?: string } }) : null;
      if (piObj) {
        console.log(`      payment_intent    : status=${piObj.status ?? "?"}`);
        if (piObj.last_payment_error) {
          console.log(
            `      LAST PAYMENT ERROR: ${piObj.last_payment_error.message ?? "?"} (decline_code=${piObj.last_payment_error.decline_code ?? "?"})`
          );
        }
      }
    } catch (e) {
      console.log(`    latest_invoice      : could not retrieve (${(e as Error).message})`);
    }
  }

  if (!subs.data.length) {
    console.log("  (no subscriptions at all on this Stripe customer)");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

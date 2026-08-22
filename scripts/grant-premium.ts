/**
 * Grant/restore Premium on ONE account, by email, to an explicit end date — and
 * RE-LINK IT TO STRIPE so the next renewal actually lands.
 *
 * WHY THIS EXISTS. The 2026-08-22 incident: RM7 went over its Neon transfer
 * allowance, and RM8 (the rollback) was restored from RM6 — the newest source
 * still readable. RM6 stopped being live on 2026-08-20, so every write in the
 * 08-20..08-22 window was lost: new signups, Premium grants, alerts, orders.
 * At least one paying subscriber lost the premiumUntil their Stripe
 * subscription had already paid for.
 *
 * SETTING premiumUntil ALONE IS NOT ENOUGH, and that is the whole point of this
 * script. api/marketplace/stripe/webhook's premiumRenewed() resolves the account
 * to extend in this order:
 *
 *   1. subscription.metadata.userId  — the PREFERRED path
 *   2. User.stripeCustomerId matching invoice.customer  — the fallback
 *
 * Both are links between a Stripe object and a User ROW ID. If the row was lost
 * and recreated (a fresh OAuth sign-in mints a NEW cuid), the metadata points at
 * an id that no longer exists and the customer id is gone from the User table —
 * so premiumRenewed() finds nobody, its update no-ops behind a .catch(() => {}),
 * and the subscriber silently stops receiving what they are paying for. Nobody
 * gets an error; it just quietly stops working at the next invoice.
 *
 * So this script repairs BOTH links, and reports what it could not repair rather
 * than reporting success it did not achieve.
 *
 * NOT TO BE CONFUSED WITH A CONNECT ACCOUNT. A Stripe id beginning `acct_` is a
 * CONNECT account — marketplace seller payouts, stored on
 * SellerProfile.stripeAccountId. It is NOT a customer id and must never be put
 * in User.stripeCustomerId: invoice.customer is always `cus_…`, so an `acct_`
 * there matches nothing and fails exactly as silently as the bug above. This
 * script resolves the customer from Stripe BY EMAIL instead of trusting an id
 * pasted in by hand, and refuses anything that is not a `cus_…`.
 *
 * Usage:
 *   TARGET_EMAIL=someone@example.com PREMIUM_UNTIL=2026-08-30 \
 *     npx tsx scripts/grant-premium.ts
 *
 *   DRY_RUN=1   report the current state and the planned change, write nothing.
 *   SKIP_STRIPE=1  set the date only; do not touch Stripe (offline/no key).
 */
import { prisma } from "../src/lib/db";
import { isPremium } from "../src/lib/premium";
import { stripe, stripeEnabled } from "../src/lib/stripe";

const EMAIL = (process.env.TARGET_EMAIL ?? "").trim().toLowerCase();
const UNTIL_RAW = (process.env.PREMIUM_UNTIL ?? "").trim();
const DRY = process.env.DRY_RUN === "1";
const SKIP_STRIPE = process.env.SKIP_STRIPE === "1";

const SELECT = {
  id: true,
  email: true,
  displayName: true,
  createdAt: true,
  premiumUntil: true,
  isAdmin: true,
  earlyPremiumGranted: true,
  trialStartedAt: true,
  stripeCustomerId: true,
} as const;

type Row = {
  premiumUntil: Date | null;
  isAdmin: boolean;
  earlyPremiumGranted: boolean;
  trialStartedAt: Date | null;
  stripeCustomerId: string | null;
};

function show(label: string, u: Row) {
  console.log(`\n== ${label} ==`);
  console.log(`  premiumUntil     : ${u.premiumUntil ? u.premiumUntil.toISOString() : "null"}`);
  console.log(`  isAdmin          : ${u.isAdmin}`);
  console.log(`  trialStartedAt   : ${u.trialStartedAt ? u.trialStartedAt.toISOString() : "null"}`);
  console.log(`  stripeCustomerId : ${u.stripeCustomerId ?? "null"}`);
  console.log(`  → isPremium()    : ${isPremium(u)}`);
}

async function main() {
  if (!EMAIL) {
    console.error("::error::TARGET_EMAIL is required.");
    process.exit(1);
  }
  if (!UNTIL_RAW) {
    console.error("::error::PREMIUM_UNTIL is required (e.g. 2026-08-30).");
    process.exit(1);
  }

  // Date-only input means "through the END of that day", not 00:00 — granting to
  // midnight would cut the subscriber a full day short of what they paid for.
  const until = /^\d{4}-\d{2}-\d{2}$/.test(UNTIL_RAW)
    ? new Date(`${UNTIL_RAW}T23:59:59.000Z`)
    : new Date(UNTIL_RAW);
  if (Number.isNaN(until.getTime())) {
    console.error(`::error::PREMIUM_UNTIL is not a valid date: ${UNTIL_RAW}`);
    process.exit(1);
  }

  const user = await prisma.user.findFirst({ where: { email: EMAIL }, select: SELECT });
  if (!user) {
    // Deliberately does NOT create the account. An OAuth user's row carries a
    // provider identity this script cannot invent, and a hand-made row would
    // collide with the real one the moment they next sign in — turning one lost
    // account into two half-broken ones. Report and stop.
    console.error(
      `::error::no account found with email ${EMAIL}. It was most likely lost in the ` +
        `2026-08-20..22 window. Do NOT hand-create it: ask them to sign in once (OAuth ` +
        `will recreate the row with a valid provider identity), then re-run this script.`
    );
    process.exit(1);
  }

  console.log(`Account : ${user.email} (${user.id})`);
  console.log(`Created : ${user.createdAt.toISOString()}`);
  // A createdAt AFTER the source snapshot means this row is a POST-restore
  // recreation, so any Stripe object still points at the id it replaced.
  if (user.createdAt > new Date("2026-08-20T00:00:00Z")) {
    console.log(
      "::warning::this row was created after 2026-08-20, i.e. it is a fresh row, not the " +
        "original. Any Stripe subscription metadata still names the OLD user id — the " +
        "re-link below is what makes renewals work again."
    );
  }
  show("BEFORE", user);
  console.log(`\nPlanned premiumUntil: ${until.toISOString()}`);

  if (!DRY) {
    await prisma.user.update({ where: { id: user.id }, data: { premiumUntil: until } });
    const after = await prisma.user.findUnique({ where: { id: user.id }, select: SELECT });
    if (after) show("AFTER", after);
  } else {
    console.log("\nDRY_RUN=1 — nothing written.");
  }

  // ── Stripe re-link ────────────────────────────────────────────────────────
  if (SKIP_STRIPE) {
    console.log("\nSKIP_STRIPE=1 — Stripe not contacted. The renewal link is NOT verified.");
    return;
  }
  if (!stripeEnabled()) {
    console.log("\n::warning::STRIPE_SECRET_KEY not set — cannot verify the renewal link.");
    return;
  }

  console.log("\n== Stripe ==");
  let customerId: string | null = null;
  try {
    const found = await stripe().customers.list({ email: EMAIL, limit: 10 });
    if (!found.data.length) {
      console.log(`::warning::no Stripe customer with email ${EMAIL}. If they subscribed under a ` +
        `different email, the renewal cannot be re-linked automatically.`);
    } else {
      if (found.data.length > 1) {
        console.log(`::warning::${found.data.length} Stripe customers share this email: ` +
          `${found.data.map((c) => c.id).join(", ")}. Using the one with an active subscription.`);
      }
      for (const c of found.data) {
        const subs = await stripe().subscriptions.list({ customer: c.id, status: "all", limit: 10 });
        const live = subs.data.find((s) => s.status === "active" || s.status === "trialing");
        if (live) {
          customerId = c.id;
          console.log(`  customer     : ${c.id}`);
          console.log(`  subscription : ${live.id} (${live.status})`);
          console.log(`  period end   : ${new Date(live.current_period_end * 1000).toISOString()}`);
          console.log(`  metadata.userId (before): ${live.metadata?.userId ?? "unset"}`);
          if (!DRY && live.metadata?.userId !== user.id) {
            // THE load-bearing repair: premiumRenewed() reads this FIRST.
            await stripe().subscriptions.update(live.id, { metadata: { ...live.metadata, userId: user.id } });
            console.log(`  metadata.userId (after) : ${user.id}  ← re-linked`);
          }
          break;
        }
        console.log(`  ${c.id}: no active/trialing subscription`);
      }
    }
  } catch (e) {
    console.log(`::warning::Stripe lookup failed: ${(e as Error).message}`);
  }

  if (customerId && customerId !== user.stripeCustomerId) {
    if (!customerId.startsWith("cus_")) {
      console.log(`::error::refusing to store ${customerId} — not a customer id.`);
    } else if (!DRY) {
      await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } });
      console.log(`  User.stripeCustomerId ← ${customerId}`);
    }
  } else if (customerId) {
    console.log("  User.stripeCustomerId already correct.");
  }

  if (!customerId) {
    console.log(
      "\n::warning::no active subscription was re-linked. premiumUntil is set, so they have " +
        "access now, but the NEXT renewal may not extend it. Verify manually in Stripe."
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

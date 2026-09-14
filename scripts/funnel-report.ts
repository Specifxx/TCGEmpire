/**
 * THE WEEKLY PREMIUM FUNNEL REPORT — read-only, aggregate-only.
 *
 * WHY THIS EXISTS. On 2026-09-14 the owner asked "why did we have more premium
 * users signing up before?" and the honest answer was that nobody could tell.
 * The two admin pages cannot answer it between them:
 *
 *   /admin/subscriptions  computes trial→paid as an ALL-TIME ratio with
 *                         in-flight trials stuck in the denominator, so it has
 *                         no time dimension at all and can never show a trend.
 *   /admin/accounts       looks back exactly 30 days, so it cannot reach the
 *                         August baseline anyone wants to compare against.
 *
 * So this buckets everything by ISO week, joins the Postgres side (accounts,
 * attribution, Premium interest) to the Stripe side (subscriptions, trials,
 * conversions, churn), and prints one table you can read week over week.
 *
 * NEVER WRITES. No prisma create/update/upsert/delete, no Stripe mutation.
 * Aggregate only — no emails, names or customer ids reach the log, because this
 * runs in CI where the output is retained.
 *
 * Usage:
 *   npx tsx scripts/funnel-report.ts          # last 8 weeks
 *   WEEKS=12 npx tsx scripts/funnel-report.ts
 */
import { prisma } from "../src/lib/db";
import { NOT_SEED_WHERE } from "../src/lib/premium";
import { tierFromPriceId } from "../src/lib/premium";
import { stripeEnabled } from "../src/lib/stripe";
import { fetchAllSubscriptions, isActive, monthlyValueCents } from "../src/lib/subscription-metrics";

const WEEKS = Math.max(1, Math.min(52, Number(process.env.WEEKS ?? 8)));
const DAY = 86_400_000;
const WEEK = 7 * DAY;

/** Monday 00:00 UTC of the week containing `ms`. */
function weekStart(ms: number): number {
  const d = new Date(ms);
  d.setUTCHours(0, 0, 0, 0);
  // getUTCDay(): 0=Sun..6=Sat. Shift so Monday is the first day.
  const back = (d.getUTCDay() + 6) % 7;
  return d.getTime() - back * DAY;
}
const label = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function emptyRow() {
  return {
    accounts: 0,
    premiumClicks: 0,
    checkoutStarts: 0,
    trialStamps: 0,
    expiries: 0,
    subsCreated: 0,
    plusCreated: 0,
    premiumCreated: 0,
    annualCreated: 0,
    trialsStarted: 0,
    trialsConverted: 0,
    cancellations: 0,
  };
}
type Row = ReturnType<typeof emptyRow>;

async function main() {
  const now = Date.now();
  const thisWeek = weekStart(now);
  const firstWeek = thisWeek - (WEEKS - 1) * WEEK;
  const weeks: number[] = Array.from({ length: WEEKS }, (_, i) => firstWeek + i * WEEK);
  const buckets = new Map<number, Row>(weeks.map((w) => [w, emptyRow()]));
  const bump = (ms: number | null | undefined, f: (r: Row) => void) => {
    if (ms == null) return;
    const w = weekStart(ms);
    const row = buckets.get(w);
    if (row) f(row);
  };

  // ── Postgres side ─────────────────────────────────────────────────────────
  const since = new Date(firstWeek);
  const users = await prisma.user.findMany({
    where: { AND: [NOT_SEED_WHERE, { createdAt: { gte: since } }] },
    select: { createdAt: true, signupSource: true },
  });
  for (const u of users) bump(u.createdAt.getTime(), (r) => r.accounts++);

  const sources = new Map<string, number>();
  for (const u of users) {
    const k = u.signupSource ?? "(untracked)";
    sources.set(k, (sources.get(k) ?? 0) + 1);
  }

  const clicks = await prisma.premiumClick.findMany({
    where: { createdAt: { gte: since } },
    select: { createdAt: true, source: true },
  });
  for (const c of clicks) {
    bump(c.createdAt.getTime(), (r) => {
      r.premiumClicks++;
      if (c.source === "checkout") r.checkoutStarts++;
    });
  }

  const trialStamps = await prisma.user.findMany({
    where: { AND: [NOT_SEED_WHERE, { trialStartedAt: { gte: since } }] },
    select: { trialStartedAt: true },
  });
  for (const u of trialStamps) bump(u.trialStartedAt?.getTime() ?? null, (r) => r.trialStamps++);

  // Entitlements that ran out in the window — the DB's own view of churn.
  const expired = await prisma.user.findMany({
    where: { AND: [NOT_SEED_WHERE, { premiumUntil: { gte: since, lt: new Date(now) } }] },
    select: { premiumUntil: true },
  });
  for (const u of expired) bump(u.premiumUntil?.getTime() ?? null, (r) => r.expiries++);

  // ── Stripe side ───────────────────────────────────────────────────────────
  let stripeNote = "";
  let mrrNowCents = 0;
  let mrrCurrency = "";
  if (!stripeEnabled()) {
    stripeNote = "Stripe is not configured in this environment — subscription columns are blank.";
  } else {
    const { rows, capped } = await fetchAllSubscriptions();
    if (capped) stripeNote = "WARNING: hit the subscription page cap — older subscriptions are missing.";
    for (const s of rows) {
      const tier = tierFromPriceId(s.priceId);
      bump(s.createdMs, (r) => {
        r.subsCreated++;
        if (tier === "plus") r.plusCreated++;
        else r.premiumCreated++;
        if (s.interval === "year") r.annualCreated++;
      });
      // Trials are bucketed by the week the trial STARTED, and counted as
      // converted in that same cohort — the question is "of the trials begun in
      // week W, how many are paying now", which is what the all-time ratio on
      // /admin/subscriptions cannot express.
      if (s.trialEndMs != null) {
        bump(s.createdMs, (r) => {
          r.trialsStarted++;
          if (s.trialEndMs! <= now && isActive(s.status)) r.trialsConverted++;
        });
      }
      const ended = s.endedAtMs ?? (s.status === "canceled" ? s.canceledAtMs : null);
      bump(ended, (r) => r.cancellations++);
    }
    const live = rows.filter((s) => isActive(s.status));
    const byCur = new Map<string, number>();
    for (const s of live) byCur.set(s.currency, (byCur.get(s.currency) ?? 0) + monthlyValueCents(s));
    const top = [...byCur.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top) {
      mrrCurrency = top[0].toUpperCase();
      mrrNowCents = top[1];
    }
  }

  // ── Output ────────────────────────────────────────────────────────────────
  console.log("RiftCompare premium funnel — by ISO week (Monday start, UTC)\n");
  console.log("HOW TO READ THIS. Four documented discontinuities sit inside any window");
  console.log("that reaches back to August, and none of them are demand:");
  console.log("  · 2026-08-24  the free trial went 3 -> 14 days, so every subscription");
  console.log("                after it takes 14 days to become revenue, not 3.");
  console.log("  · 2026-08-31  past_due and unpaid checkouts stopped counting as");
  console.log("                entitled, which cut the headcount with no demand change.");
  console.log("  · 2026-09-13  signupSource values premium_cta / premium_dialog first");
  console.log("                existed; before that those signups recorded as 'login'.");
  console.log("  · 2026-08-20..22 a database recovery lost writes — that week is thin.");
  console.log("Trials are bucketed by the week they STARTED and counted as converted in");
  console.log("that same cohort, so recent weeks understate conversion until they mature.\n");
  if (stripeNote) console.log(`${stripeNote}\n`);

  const head = [
    "week", "accts", "clicks", "chkout", "trialDB",
    "subs", "plus", "prem", "ann", "trials", "conv", "canc", "expired",
  ];
  const w = (s: string | number, n: number) => String(s).padStart(n);
  console.log(head.map((h, i) => w(h, i === 0 ? 10 : 7)).join(" "));
  for (const wk of weeks) {
    const r = buckets.get(wk)!;
    console.log(
      [
        label(wk).padStart(10),
        w(r.accounts, 7), w(r.premiumClicks, 7), w(r.checkoutStarts, 7), w(r.trialStamps, 7),
        w(r.subsCreated, 7), w(r.plusCreated, 7), w(r.premiumCreated, 7), w(r.annualCreated, 7),
        w(r.trialsStarted, 7), w(r.trialsConverted, 7), w(r.cancellations, 7), w(r.expiries, 7),
      ].join(" ")
    );
  }

  console.log("\nColumns: accts=accounts created · clicks=PremiumClick rows · chkout=of those,");
  console.log("source 'checkout' · trialDB=User.trialStartedAt stamped · subs/plus/prem/ann=");
  console.log("Stripe subscriptions created (tier, and how many annual) · trials=trials begun");
  console.log("· conv=of those, paying now · canc=subscriptions ended · expired=premiumUntil");
  console.log("ran out.\n");

  if (mrrCurrency) console.log(`MRR now: ${(mrrNowCents / 100).toFixed(2)} ${mrrCurrency}\n`);

  const total = users.length;
  console.log(`Signup source, last ${WEEKS} week(s) (${total} account${total === 1 ? "" : "s"}):`);
  for (const [k, n] of [...sources.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)}  ${k}`);
  }
}

main()
  .catch((e) => {
    console.error("funnel-report failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

/**
 * WHO CANCELS THEIR PREMIUM TRIAL, WHEN, AND WHAT THEY DID FIRST — read-only.
 *
 * Owner, 2026-09-24: "A lot of people register for the trial and cancel."
 * The funnel report (scripts/funnel-report.ts) could not see it: it counts a
 * cancellation only once the subscription has ENDED. A trialist who clicks
 * Cancel in the Stripe portal stays `trialing` with `cancel_at_period_end`
 * until the 14 days run out, so the report counted them as live trials while
 * Stripe's dashboard showed "Cancels <date>". The 2026-09-23 read of "one
 * cancellation ever" was that blind spot. DECISIONS.md, "Trial model: 3-day
 * trial, then the first 3 months half price", 2026-09-24.
 *
 * Also counts SAVES (a cancelled subscription kept via api/premium/resume, or
 * resumed in the portal — the latter from customer.subscription.updated events,
 * which Stripe keeps for 30 days), splits 14-day from 3-day trials and the
 * intro coupon, and takes --since=YYYY-MM-DD to read one cohort alone. Every
 * cancel is also split by door: /premium's "Turn off auto-renew" (metadata
 * turnedOffVia, 2026-09-25) versus Stripe's portal or dashboard.
 *
 * Per trial it reads, from Stripe: when the trial started, whether and when it
 * was cancelled (cancel_at_period_end OR canceled_at), Stripe's
 * cancellation_details (reason / feedback / comment — feedback only exists if
 * the portal asks for it), plan, interval and the checkout surface. From the
 * database, joined on stripeCustomerId: how old the account was at trial start,
 * how active it was, how many alerts and collection cards it had, and whether
 * the "trial ends soon" email had gone out before the cancel.
 *
 * NEVER WRITES — no Stripe mutation, no prisma write. Prints aggregates and an
 * anonymised per-trial table (#1, #2 …): no email, name or customer id reaches
 * the CI log. Free-text cancel comments are printed, trimmed, because they are
 * the most direct answer to "why".
 *
 * Usage: npx tsx scripts/trial-cancel-report.ts   (needs STRIPE_SECRET_KEY)
 */
import type Stripe from "stripe";
import { prisma } from "../src/lib/db";
import { stripe, stripeEnabled } from "../src/lib/stripe";
import { tierFromPriceId, NOT_SEED_WHERE } from "../src/lib/premium";
import { classifyTrial, cancelBucket, cancelDoor, TURNED_OFF_VIA_BUTTON, type TrialRow } from "../src/lib/trial-cancel";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

async function fetchTrialSubs(): Promise<Stripe.Subscription[]> {
  const out: Stripe.Subscription[] = [];
  let startingAfter: string | undefined;
  for (let i = 0; i < 20; i++) {
    const page = await stripe().subscriptions.list({
      status: "all",
      limit: 100,
      expand: ["data.items.data.price"],
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    for (const s of page.data) if (s.trial_start || s.trial_end) out.push(s);
    if (!page.has_more || page.data.length === 0) break;
    startingAfter = page.data[page.data.length - 1].id;
  }
  return out;
}

function pct(n: number, d: number): string {
  return d ? `${Math.round((n / d) * 100)}%` : "—";
}

/** Subscriptions whose renewal went from off back to on in the last 30 days (read-only). */
async function resumedSubscriptionIds(): Promise<Set<string>> {
  const out = new Set<string>();
  let startingAfter: string | undefined;
  const since = Math.floor(Date.now() / 1000) - 30 * 86_400;
  for (let i = 0; i < 10; i++) {
    const page = await stripe().events.list({
      type: "customer.subscription.updated",
      created: { gte: since },
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    for (const ev of page.data) {
      const prev = ev.data.previous_attributes as { cancel_at_period_end?: boolean } | undefined;
      const obj = ev.data.object as Stripe.Subscription;
      if (prev?.cancel_at_period_end === true && obj.cancel_at_period_end === false) out.add(obj.id);
    }
    if (!page.has_more || !page.data.length) break;
    startingAfter = page.data[page.data.length - 1].id;
  }
  return out;
}

async function main() {
  const sinceArg = process.argv.find((a) => a.startsWith("--since="))?.slice(8) ?? process.env.SINCE;
  const sinceMs = sinceArg ? Date.parse(`${sinceArg}T00:00:00Z`) : null;
  if (!stripeEnabled()) {
    console.log("Stripe is not configured in this environment — nothing to report.");
    return;
  }
  const now = Date.now();
  const allSubs = await fetchTrialSubs();
  const subs = sinceMs ? allSubs.filter((s) => (s.trial_start ?? s.created) * 1000 >= sinceMs) : allSubs;
  const resumed = await resumedSubscriptionIds().catch(() => new Set<string>());
  const customerIds = [...new Set(subs.map((s) => (typeof s.customer === "string" ? s.customer : s.customer.id)))];
  const users = await prisma.user.findMany({
    where: { stripeCustomerId: { in: customerIds }, ...NOT_SEED_WHERE },
    select: {
      stripeCustomerId: true,
      createdAt: true,
      signupSource: true,
      activeDays: true,
      lastActiveAt: true,
      trialReminderSentAt: true,
      _count: { select: { priceAlerts: true, collection: true } },
    },
  });
  const byCustomer = new Map(users.map((u) => [u.stripeCustomerId!, u]));

  const rows: TrialRow[] = subs.map((s) => {
    const cust = typeof s.customer === "string" ? s.customer : s.customer.id;
    const u = byCustomer.get(cust);
    const price = s.items?.data?.[0]?.price as Stripe.Price | undefined;
    const d = s.cancellation_details;
    return {
      status: s.status,
      trialStartMs: (s.trial_start ?? s.created) * 1000,
      trialEndMs: s.trial_end ? s.trial_end * 1000 : null,
      cancelAtPeriodEnd: s.cancel_at_period_end,
      canceledAtMs: s.canceled_at ? s.canceled_at * 1000 : null,
      endedAtMs: s.ended_at ? s.ended_at * 1000 : null,
      reason: d?.reason ?? null,
      feedback: d?.feedback ?? null,
      comment: d?.comment ?? null,
      tier: tierFromPriceId(price?.id),
      interval: price?.recurring?.interval ?? null,
      surface: typeof s.metadata?.surface === "string" ? s.metadata.surface : null,
      matchedUser: !!u,
      accountAgeDaysAtTrial: u ? Math.floor(((s.trial_start ?? s.created) * 1000 - u.createdAt.getTime()) / DAY) : null,
      signupSource: u?.signupSource ?? null,
      activeDays: u?.activeDays ?? null,
      alerts: u?._count.priceAlerts ?? null,
      collectionCards: u?._count.collection ?? null,
      reminderSentMs: u?.trialReminderSentAt ? u.trialReminderSentAt.getTime() : null,
      trialDays: s.trial_start && s.trial_end ? Math.round((s.trial_end - s.trial_start) / 86_400) : null,
      couponId: s.discount?.coupon?.id ?? null,
      keptAtMs: typeof s.metadata?.keptAt === "string" ? Date.parse(s.metadata.keptAt) : null,
      keptVia: typeof s.metadata?.keptVia === "string" ? s.metadata.keptVia : null,
      resumedByEvent: resumed.has(s.id),
      turnedOffAtMs: typeof s.metadata?.turnedOffAt === "string" ? Date.parse(s.metadata.turnedOffAt) : null,
      turnedOffVia: typeof s.metadata?.turnedOffVia === "string" ? s.metadata.turnedOffVia : null,
    };
  });

  const classified = rows.map((r) => ({ r, c: classifyTrial(r, now) }));
  const count = (k: string) => classified.filter((x) => x.c.outcome === k).length;
  const total = rows.length;
  const cancelled = classified.filter((x) => x.c.outcome === "cancelled_in_trial");

  console.log("RiftCompare Premium — trial cancellation report\n");
  if (sinceMs) console.log(`Cohort: trials started on or after ${sinceArg}\n`);
  console.log(`Trials ${sinceMs ? "started in the cohort" : "ever started"}: ${total}`);
  console.log(`  SAVES — cancelled, then kept: ${count("resumed")}  (${classified.filter((x) => x.c.outcome === "resumed" && x.r.keptVia).length} via the Keep button, ${classified.filter((x) => x.c.outcome === "resumed" && !x.r.keptVia).length} in the Stripe portal)`);
  console.log(`  cancelled during the trial:  ${count("cancelled_in_trial")}  (${pct(count("cancelled_in_trial"), total)})`);
  console.log(`    of which still running, set to cancel at trial end: ${cancelled.filter((x) => x.r.cancelAtPeriodEnd && x.r.status === "trialing").length}`);
  console.log(`  converted to paid:            ${count("converted")}  (${pct(count("converted"), total)})`);
  console.log(`  paid, then cancelled later:   ${count("churned_after_paying")}`);
  console.log(`  still in trial, not cancelled: ${count("in_trial")}`);
  console.log(`  payment failed at trial end:  ${count("payment_failed")}`);
  console.log(`  other:                        ${count("other")}`);

  console.log("\nTIME FROM TRIAL START TO THE CANCEL CLICK (cancelled trials only)");
  const buckets = new Map<string, number>();
  for (const x of cancelled) buckets.set(cancelBucket(x.c.hoursToCancel), (buckets.get(cancelBucket(x.c.hoursToCancel)) ?? 0) + 1);
  for (const b of ["< 1 hour", "1–24 hours", "1–3 days", "3–7 days", "7–11 days", "11–14 days", "unknown"]) {
    if (buckets.get(b)) console.log(`  ${b.padEnd(12)} ${String(buckets.get(b)).padStart(3)}  ${pct(buckets.get(b)!, cancelled.length)}`);
  }
  const afterReminder = cancelled.filter((x) => x.c.afterReminder === true).length;
  console.log(`  cancelled AFTER the "trial ends soon" email: ${afterReminder} of ${cancelled.length}`);

  // WHICH DOOR (2026-09-25). /premium gained a one-click "Turn off auto-renew"
  // (api/premium/auto-renew stamps turnedOffVia), and Stripe records it
  // exactly like the portal's Cancel. Inside the trial-model measurement
  // window, a new way to switch renewal off must not read as the new model
  // failing, so every cancel is split by where it happened.
  const doorLabel = (d: string | null) =>
    d === TURNED_OFF_VIA_BUTTON ? '"Turn off auto-renew" on /premium' : d === "portal" ? "Stripe portal / dashboard" : d ?? "(not off)";
  const doors = new Map<string, { inTrial: number; afterPaying: number }>();
  for (const x of classified) {
    if (x.c.outcome !== "cancelled_in_trial" && x.c.outcome !== "churned_after_paying") continue;
    const k = doorLabel(cancelDoor(x.r));
    const g = doors.get(k) ?? { inTrial: 0, afterPaying: 0 };
    if (x.c.outcome === "cancelled_in_trial") g.inTrial++;
    else g.afterPaying++;
    doors.set(k, g);
  }
  console.log("\nWHERE RENEWAL WAS SWITCHED OFF  (cancelled in trial · paid, then cancelled)");
  if (!doors.size) console.log("  (no cancels)");
  for (const [k, g] of [...doors.entries()].sort((a, b) => b[1].inTrial + b[1].afterPaying - (a[1].inTrial + a[1].afterPaying))) {
    console.log(`  ${k.padEnd(36)} ${String(g.inTrial).padStart(3)} · ${String(g.afterPaying).padStart(3)}`);
  }

  const split = (label: string, key: (r: TrialRow) => string) => {
    const groups = new Map<string, { n: number; cancelled: number; converted: number }>();
    for (const x of classified) {
      const k = key(x.r);
      const g = groups.get(k) ?? { n: 0, cancelled: 0, converted: 0 };
      g.n++;
      if (x.c.outcome === "cancelled_in_trial") g.cancelled++;
      if (x.c.outcome === "converted") g.converted++;
      groups.set(k, g);
    }
    console.log(`\nBY ${label}  (trials · cancelled in trial · converted)`);
    for (const [k, g] of [...groups.entries()].sort((a, b) => b[1].n - a[1].n)) {
      console.log(`  ${k.padEnd(26)} ${String(g.n).padStart(3)} · ${String(g.cancelled).padStart(3)} (${pct(g.cancelled, g.n)}) · ${String(g.converted).padStart(3)}`);
    }
  };
  split("TRIAL LENGTH (never pool these)", (r) => (r.trialDays == null ? "(unknown)" : `${r.trialDays}-day`));
  split("INTRO COUPON", (r) => (r.couponId?.startsWith("rc-intro-") ? "half-price intro" : r.couponId ? "other coupon" : "none"));
  split("PLAN", (r) => `${r.tier}/${r.interval ?? "?"}`);
  split("CHECKOUT SURFACE", (r) => r.surface ?? "(not stamped)");
  split("SIGNUP SOURCE", (r) => r.signupSource ?? "(unknown)");
  split("ACCOUNT AGE AT TRIAL START", (r) =>
    r.accountAgeDaysAtTrial == null ? "(no account match)" : r.accountAgeDaysAtTrial < 1 ? "same day" : r.accountAgeDaysAtTrial < 7 ? "1–6 days" : "7+ days",
  );
  split("USE DURING/AROUND TRIAL", (r) =>
    r.alerts == null ? "(no account match)" : r.alerts + (r.collectionCards ?? 0) === 0 ? "no alerts, no collection" : "has alerts or collection",
  );

  console.log("\nSTRIPE CANCELLATION FEEDBACK (only present if the portal asks for it)");
  const fb = new Map<string, number>();
  for (const x of cancelled) fb.set(x.r.feedback ?? "(none given)", (fb.get(x.r.feedback ?? "(none given)") ?? 0) + 1);
  for (const [k, n] of [...fb.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(22)} ${n}`);
  const comments = cancelled.map((x) => x.r.comment).filter((c): c is string => !!c && c.trim().length > 0);
  if (comments.length) {
    console.log("\nCANCEL COMMENTS (verbatim, trimmed)");
    for (const c of comments) console.log(`  – ${c.replace(/\s+/g, " ").slice(0, 200)}`);
  }

  console.log("\nPER TRIAL (anonymised; newest first)");
  console.log("  #   started     days plan            outcome              h→cancel  acctAge  actDays alerts coll  surface");
  classified
    .sort((a, b) => b.r.trialStartMs - a.r.trialStartMs)
    .forEach((x, i) => {
      const r = x.r;
      console.log(
        `  ${String(i + 1).padStart(2)}  ${new Date(r.trialStartMs).toISOString().slice(0, 10)}  ${String(r.trialDays ?? "?").padStart(4)} ${`${r.tier}/${r.interval ?? "?"}`.padEnd(15)} ${x.c.outcome.padEnd(20)} ${x.c.hoursToCancel == null ? "—".padStart(8) : x.c.hoursToCancel.toFixed(1).padStart(8)}  ${String(r.accountAgeDaysAtTrial ?? "—").padStart(7)} ${String(r.activeDays ?? "—").padStart(7)} ${String(r.alerts ?? "—").padStart(6)} ${String(r.collectionCards ?? "—").padStart(4)}  ${r.surface ?? ""}`,
      );
    });
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TRIAL_REMINDER_WINDOW_MS } from "../src/lib/premium";
import {
  renewalReminderDue,
  renewalReminderAhead,
  renewalTerms,
  subscriptionEndSec,
  RENEWAL_REMINDER_WINDOW_MS,
} from "../src/lib/renewal-reminders";
import { buildRenewalReminderEmail } from "../src/lib/email";
import { cancelDoor, TURNED_OFF_VIA_BUTTON, type TrialRow } from "../src/lib/trial-cancel";

// Customer feedback, 2026-09-25 (Malik, Adelaide): "Personally I hate auto
// renewal so I disable it for everything and then renew when needed." /premium
// gains a one-click "Turn off auto-renew", and paid subscriptions with it off
// get one reminder before they end, stating what renewing really charges.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const H = 3_600_000;
const NOW = Date.parse("2026-09-26T19:00:00Z");
const sec = (ms: number) => Math.floor(ms / 1000);

test("the off switch: POST only, the signed-in owner's own customer, sets cancel_at_period_end and stamps where", () => {
  const route = code("src/app/api/premium/auto-renew/route.ts");
  assert.match(route, /export async function POST\(/);
  assert.doesNotMatch(route, /export async function (GET|PUT|PATCH|DELETE)\(/, "a prefetch must never switch renewal off");
  assert.match(route, /const user = await getCurrentUser\(\);\s*if \(!user\) return NextResponse\.json\(\{ error: "Sign in first" \}, \{ status: 401 \}\);/);
  assert.match(route, /prisma\.user\.findUnique\(\{ where: \{ id: user\.id \}, select: \{ stripeCustomerId: true \} \}\)/, "ownership: the customer comes from the signed-in account, never the request");
  assert.match(route, /customer: dbUser\.stripeCustomerId,/);
  assert.doesNotMatch(route, /req\.json\(|searchParams/, "nothing from the request picks the subscription");
  assert.match(route, /cancel_at_period_end: true,/);
  assert.match(route, /metadata: \{ turnedOffAt: new Date\(\)\.toISOString\(\), turnedOffVia: TURNED_OFF_VIA_BUTTON \}/);
  assert.doesNotMatch(route, /subscriptions\.cancel\(|\.del\(|cancel_at_period_end: false/, "turns renewal off, never ends access now");
  // The same subscription the card describes (getPremiumSubscriptionDetails).
  assert.match(route, /s\.status === "active" \|\| s\.status === "trialing" \|\| s\.status === "past_due"/);
  const already = route.indexOf("if (subscriptionIsCancelling(sub))");
  const pastDue = route.indexOf('if (sub.status === "past_due")');
  const update = route.indexOf("subscriptions.update(");
  assert.ok(already > 0 && pastDue > already && update > pastDue, "already-off and past_due answer before any update");
  assert.equal(TURNED_OFF_VIA_BUTTON, "auto-renew");
});

test("the account card: the button, its one plain line, the portal link kept, and 'Turn auto-renew back on'", () => {
  const actions = code("src/components/SubscriptionActions.tsx");
  assert.match(actions, /act\("autorenew-off", "\/api\/premium\/auto-renew"\)/);
  assert.match(actions, /"Turn off auto-renew"/);
  assert.match(actions, /You keep everything until \{autoRenew\.until\}\. Nothing more is charged\./);
  assert.match(actions, /autoRenew\.reminder \? " We'll email you a day or two before it ends so you can renew in one click\." : ""/, "the email is promised only when it will really go out");
  assert.match(actions, /<ManageSubscriptionButton \/>/, "the portal stays for card updates");
  assert.match(actions, /act\("resume", "\/api\/premium\/resume"\)/, "back on is still resume, with its keep/intro logic");
  assert.match(actions, /`Turn auto-renew back on — \$\{keep\.line\} from \$\{keep\.from\}`/);
  assert.doesNotMatch(actions, /confirm\(/, "one click, reversible — no confirm-shaming step");

  const page = code("src/app/premium/page.tsx");
  assert.match(
    page,
    /subDetails && !subDetails\.cancelAtPeriodEnd && \(subDetails\.status === "active" \|\| subDetails\.status === "trialing"\)/,
    "offered only on a renewing trial or paid subscription — never past_due, never one already ending",
  );
  assert.match(page, /reminder: renewalReminderAhead\(subDetails\.currentPeriodEnd, user\?\.premiumUntil\)/);
  assert.match(page, /autoRenew=\{autoRenew\}/);
});

test("the card promises the reminder only while it is still ahead", () => {
  const end = new Date(NOW + 3 * 24 * H);
  assert.equal(renewalReminderAhead(end, end, NOW), true);
  assert.equal(renewalReminderAhead(end, null, NOW), true);
  assert.equal(renewalReminderAhead(new Date(NOW + 30 * H), null, NOW), false, "inside the window: today's run may already be past");
  assert.equal(renewalReminderAhead(end, new Date(end.getTime() + 7 * 24 * H), NOW), false, "a stacked comp: premiumUntil is not this end, so no run selects it");
});

test("the reminder is due once, for a PAID subscription with auto-renew off, ending within the window", () => {
  assert.equal(RENEWAL_REMINDER_WINDOW_MS, TRIAL_REMINDER_WINDOW_MS);
  const periodEnd = sec(NOW + 30 * H);
  const sub = { status: "active" as const, cancel_at_period_end: true, cancel_at: null, current_period_end: periodEnd, metadata: {} };
  assert.equal(renewalReminderDue(sub, NOW), true);
  assert.equal(renewalReminderDue({ ...sub, metadata: { renewReminderFor: String(periodEnd) } }, NOW), false, "once per period");
  assert.equal(renewalReminderDue({ ...sub, metadata: { renewReminderFor: String(periodEnd - 30 * 86_400) } }, NOW), true, "last period's stamp does not block this one");
  assert.equal(renewalReminderDue({ ...sub, status: "trialing" as const }, NOW), false, "trials get the trial reminder instead");
  assert.equal(renewalReminderDue({ ...sub, cancel_at_period_end: false }, NOW), false, "auto-renew on: nothing to remind");
  assert.equal(renewalReminderDue({ ...sub, current_period_end: sec(NOW + 72 * H) }, NOW), false, "not yet in the window");
  assert.equal(renewalReminderDue({ ...sub, current_period_end: sec(NOW - H) }, NOW), false, "already ended");
  const cancelAt = { ...sub, cancel_at_period_end: false, cancel_at: sec(NOW + 20 * H), current_period_end: sec(NOW + 20 * 24 * H) };
  assert.equal(subscriptionEndSec(cancelAt), sec(NOW + 20 * H));
  assert.equal(renewalReminderDue(cancelAt, NOW), true, "a cancel_at date is the real end");
});

test("the run: DB-first and bounded, claim before send, from the same daily cron as the trial reminder", () => {
  const lib = code("src/lib/renewal-reminders.ts");
  const fn = lib.slice(lib.indexOf("export async function runRenewalReminders"));
  // The stamp is the module's ONLY Stripe write, and it is metadata alone —
  // never items, price or discounts (the lock-in promise; premium.ts itself
  // stays free of subscriptions.update, tests/premium-price-increase.test.ts).
  const updates = lib.match(/subscriptions\.update\(.*$/gm) ?? [];
  assert.deepEqual(updates, ["subscriptions.update(sub.id, { metadata: { renewReminderFor: String(sub.current_period_end) } });"]);
  assert.match(fn, /premiumUntil: \{ gt: new Date\(now\), lte: new Date\(now \+ RENEWAL_REMINDER_WINDOW_MS\) \}/);
  assert.match(fn, /select: \{ id: true, email: true, stripeCustomerId: true \}/, "only the columns it uses");
  assert.match(fn, /take: \d+/, "capped");
  assert.match(fn, /status: "active",/);
  assert.match(fn, /subs\.data\.find\(\(s\) => renewalReminderDue\(s, now\)\)/);
  const claim = fn.indexOf("metadata: { renewReminderFor: String(sub.current_period_end) }");
  const send = fn.indexOf("sendRenewalReminderEmail(");
  assert.ok(claim > 0 && send > claim, "the once-per-period stamp is written before the email");
  assert.doesNotMatch(fn, /announcementOptOut|userDigestOptOut/i, "a billing notice, like the trial reminder — not a marketing list");
  const cron = code("src/app/api/cron/premium-trial-reminders/route.ts");
  assert.match(cron, /runPremiumTrialReminders\(\)/);
  assert.match(cron, /runRenewalReminders\(\)/);
  assert.match(cron, /auth !== `Bearer \$\{secret\}`/);
});

test("what renewing charges: the intro months left are kept by renewing; after the end a payer pays full price", () => {
  const periodEndSec = sec(Date.parse("2026-10-01T00:00:00Z"));
  const base = {
    unitAmount: 999,
    currency: "usd",
    interval: "month" as const,
    introAmountOff: 500,
    hasDiscount: true,
    introEndSec: sec(Date.parse("2026-11-15T00:00:00Z")),
    periodEndSec,
    everPaid: true,
    onListPrice: true,
  };
  assert.deepEqual(renewalTerms(base), {
    renewLine: "US$4.99/mo (half price), then US$9.99/mo",
    introMonthsLeft: 2,
    newSubLine: "US$9.99/mo",
  });
  const over = renewalTerms({ ...base, introEndSec: periodEndSec - 86_400 });
  assert.equal(over.renewLine, "US$9.99/mo", "a coupon that no longer covers the next renewal is not quoted");
  assert.equal(over.introMonthsLeft, 0);
  const annual = renewalTerms({ ...base, unitAmount: 7999, interval: "year", introAmountOff: 0, hasDiscount: false, introEndSec: null });
  assert.deepEqual(annual, { renewLine: "US$79.99/yr", introMonthsLeft: 0, newSubLine: "US$79.99/yr" });
  assert.equal(renewalTerms({ ...base, onListPrice: false }).newSubLine, null, "a grandfathered rate is not what checkout would charge");
  assert.equal(renewalTerms({ ...base, everPaid: false }).newSubLine, null, "never paid: a new subscription would get the intro, so no full-price claim");
});

test("the reminder email: the date, no charge, the real renewal charge, one-click link, no pressure", () => {
  const e = buildRenewalReminderEmail({
    planName: "Premium",
    endsAt: new Date("2026-09-28T12:00:00Z"),
    renewLine: "US$4.99/mo (half price), then US$9.99/mo",
    introMonthsLeft: 2,
    newSubLine: "US$9.99/mo",
  });
  assert.equal(e.subject, "Your RiftCompare Premium ends on September 28, 2026 — renew with one click");
  assert.match(e.html, /nothing more will be charged/);
  assert.match(e.html, /nothing is charged before September 28, 2026, then <strong[^>]*>US\$4\.99\/mo \(half price\), then US\$9\.99\/mo<\/strong>/);
  assert.match(e.html, /keep your 2 remaining half-price months; a new subscription after it ends is the full price, US\$9\.99\/mo\./);
  assert.match(e.html, /\/premium\?keep=1#keep/);
  assert.match(e.html, /Otherwise there's nothing to do\./);
  assert.match(e.html, /You're getting this once/);
  assert.doesNotMatch(e.html, /last chance|hurry|don't miss|countdown|expires in/i);
  const plain = buildRenewalReminderEmail({ planName: "Plus", endsAt: new Date("2026-09-28T12:00:00Z"), renewLine: "US$39.99/yr", introMonthsLeft: 0, newSubLine: "US$39.99/yr" });
  assert.doesNotMatch(plain.html, /half-price/);
  assert.match(plain.html, /If it ends, you can subscribe again any time at US\$39\.99\/yr\./);
});

test("/premium FAQ answers 'Can I turn off auto-renew?' — and the pitch, pricing cards and checkout do not", () => {
  const page = code("src/app/premium/page.tsx");
  const faq = page.slice(page.indexOf("const FAQ:"), page.indexOf("export default async function PremiumPage"));
  assert.match(faq, /q: "Can I turn off auto-renew\?"/);
  assert.match(faq, /You keep everything until the end of your trial or the period you've paid for, and nothing more is charged\./);
  assert.match(faq, /Renewing before it ends keeps any half-price months you have left; once it has ended, a new subscription is the full price for anyone who has already paid\./);
  assert.match(page, /faqPage\(FAQ\)/, "the same Q&A goes into the FAQPage JSON-LD");
  const hero = page.slice(page.indexOf("export default async function PremiumPage"), page.indexOf("Your subscription"));
  assert.doesNotMatch(hero.slice(hero.indexOf("return (")), /auto-renew/i, "not in the hero, lock-in banner or pricing block");
  for (const f of [
    "src/components/PremiumPricingCards.tsx",
    "src/components/PremiumDialog.tsx",
    "src/app/api/premium/checkout/route.ts",
    "src/app/premium/start/page.tsx",
  ]) {
    assert.doesNotMatch(read(f), /auto-renew/i, `${f}: the pitch and checkout stay as measured`);
  }
});

test("/premium/welcome: one plain line under the timeline", () => {
  const welcome = code("src/app/premium/welcome/page.tsx");
  const timeline = welcome.indexOf("data-trial-timeline");
  const note = welcome.indexOf("data-auto-renew-note");
  const unlocked = welcome.indexOf("Just unlocked");
  assert.ok(timeline > 0 && note > timeline && unlocked > note, "after the dated terms, before the feature list");
  assert.match(welcome, /Prefer not to auto-renew\? You can switch it off on your\{" "\}/);
  assert.match(welcome, /— you keep the full \{trial \? "trial" : "period"\} and we&apos;ll remind you before it ends\./);
});

test("the report tells the auto-renew button's switch-offs from the portal's", () => {
  const base: TrialRow = {
    status: "trialing", trialStartMs: 0, trialEndMs: 3 * 24 * H, cancelAtPeriodEnd: true, canceledAtMs: H,
    endedAtMs: null, reason: null, feedback: null, comment: null, tier: "premium", interval: "month", surface: null,
    matchedUser: true, accountAgeDaysAtTrial: 0, signupSource: null, activeDays: 1, alerts: 0, collectionCards: 0,
    reminderSentMs: null, trialDays: 3,
  };
  assert.equal(cancelDoor({ ...base, turnedOffAtMs: H, turnedOffVia: TURNED_OFF_VIA_BUTTON }), "auto-renew");
  assert.equal(cancelDoor(base), "portal");
  assert.equal(
    cancelDoor({ ...base, turnedOffAtMs: H, turnedOffVia: TURNED_OFF_VIA_BUTTON, keptAtMs: 2 * H, canceledAtMs: 5 * H }),
    "portal",
    "button → Keep → portal cancel: the newer Keep means this cancel was not the button's",
  );
  assert.equal(cancelDoor({ ...base, cancelAtPeriodEnd: false, canceledAtMs: null }), null, "renewal on: no door");
  const script = code("scripts/trial-cancel-report.ts");
  assert.match(script, /turnedOffVia: typeof s\.metadata\?\.turnedOffVia === "string" \? s\.metadata\.turnedOffVia : null/);
  assert.match(script, /cancelDoor\(x\.r\)/);
  assert.doesNotMatch(script, /\.(create|update|del)\(/, "still read-only");
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { subscriptionChargeLine, subscriptionIsCancelling, TRIAL_REMINDER_WINDOW_MS } from "../src/lib/premium";
import { buildTrialWelcomeEmail } from "../src/lib/email";
import { classifyTrial, type TrialRow } from "../src/lib/trial-cancel";

// DECISIONS.md, "Trial cancellations: keep, remind, tell the truth", 2026-09-24.
// Five of the six cancelled trials were renewal switched off while the trial ran;
// the site then told them it would charge them, and gave them no way back.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (p: string) => read(p).replace(/^\s*\/\/.*$/gm, "");

test("a subscription is 'cancelling' by either Stripe field", () => {
  assert.equal(subscriptionIsCancelling({ cancel_at_period_end: true, cancel_at: null }), true);
  assert.equal(subscriptionIsCancelling({ cancel_at_period_end: false, cancel_at: 1_800_000_000 }), true);
  assert.equal(subscriptionIsCancelling({ cancel_at_period_end: false, cancel_at: null }), false);
});

test("the charge line is read from the subscription, intro-aware", () => {
  assert.equal(subscriptionChargeLine({ unitAmount: 999, currency: "usd", introAmountOff: 500, interval: "month" }), "US$4.99/mo (half price), then US$9.99/mo");
  assert.equal(subscriptionChargeLine({ unitAmount: 999, currency: "usd", introAmountOff: 0, interval: "month" }), "US$9.99/mo");
  assert.equal(subscriptionChargeLine({ unitAmount: 7999, currency: "usd", introAmountOff: 0, interval: "year" }), "US$79.99/yr");
  assert.equal(subscriptionChargeLine({ unitAmount: null, currency: "usd", introAmountOff: 0, interval: "month" }), null);
});

test("/premium: a cancelled trial is told it won't be charged — the cancel test comes before the trial test", () => {
  const page = code("src/app/premium/page.tsx");
  const cancelAt = page.indexOf("{subDetails.cancelAtPeriodEnd ? (");
  const trialAt = page.indexOf(') : subDetails.status === "trialing" ? (');
  assert.ok(cancelAt > 0 && trialAt > cancelAt, "cancelling is checked first");
  assert.match(page, /Trial ends \{fmtDate\(subDetails\.currentPeriodEnd\)\} — you won&apos;t be charged/);
  assert.match(page, /Converts to \{subscriptionChargeLine\(subDetails\)/);
  const lib = code("src/lib/premium.ts");
  assert.doesNotMatch(lib, /s\.status === "trialing"\) \?\? subs\.data\[0\]/, "no fallback to a dead subscription");
  assert.match(lib, /cancelAtPeriodEnd: subscriptionIsCancelling\(sub\)/);
});

test("Keep: POST only, the signed-in owner's own customer, clears the cancel, intro on checkout's rule", () => {
  const route = code("src/app/api/premium/resume/route.ts");
  assert.match(route, /export async function POST\(/);
  assert.doesNotMatch(route, /export async function (GET|PUT|PATCH|DELETE)\(/, "a mail scanner's prefetch must not resume anything");
  assert.match(route, /const user = await getCurrentUser\(\);/);
  assert.match(route, /customer: dbUser\.stripeCustomerId,/);
  assert.match(route, /cancel_at_period_end: false,/);
  assert.doesNotMatch(route, /metadata: \{\s*\}/);
  assert.match(route, /price\.recurring\?\.interval === "month" &&\s*!sub\.discount &&\s*!\(await hasEverPaid\(dbUser\.stripeCustomerId\)\)/);
  const actions = code("src/components/SubscriptionActions.tsx");
  assert.match(actions, /act\("resume", "\/api\/premium\/resume"\)/);
  assert.match(actions, /`Keep \$\{TIER_NAMES\[tier\]\} — \$\{keep\.line\} from \$\{keep\.from\}`/, "the button names the amount and the date");
  assert.match(actions, /Or do nothing and it simply ends then\./);
});

test("plan switches are hidden during a trial (their routes only handle paid subscriptions)", () => {
  const actions = code("src/components/SubscriptionActions.tsx");
  for (const v of ["canUpgrade", "canDowngrade", "canGoAnnual"]) {
    assert.match(actions, new RegExp(`const ${v} = [^;]*&& !trialing && !keep;`), v);
  }
});

test("reminders: one 48h window for both branches, the no-charge email for a cancelling trial, stamp always", () => {
  assert.equal(TRIAL_REMINDER_WINDOW_MS, 172_800_000);
  const lib = code("src/lib/premium.ts");
  const fn = lib.slice(lib.indexOf("export async function runPremiumTrialReminders"), lib.indexOf("export async function runCheckoutRecovery"));
  assert.match(fn, /const cutoff = new Date\(Date\.now\(\) \+ TRIAL_REMINDER_WINDOW_MS\);/);
  const cancelAt = fn.indexOf("if (subscriptionIsCancelling(sub)) {");
  const noCharge = fn.indexOf("sendTrialEndingNoChargeEmail(");
  const charge = fn.indexOf("sendTrialEndingEmail(");
  assert.ok(cancelAt > 0 && noCharge > cancelAt && charge > noCharge, "a cancelling trial never reaches the charge warning");
  assert.match(fn, /await prisma\.user\.update\(\{ where: \{ id: u\.id \}, data: \{ trialReminderSentAt: new Date\(\) \} \}\)/);
  const email = read("src/lib/email.ts");
  assert.match(email, /nothing will be charged/);
  assert.match(email, /\/premium\?keep=1#keep/);
  for (const f of ["src/app/premium/page.tsx", "src/app/premium/start/page.tsx", "src/lib/articles.ts"]) {
    assert.doesNotMatch(read(f), /the day before/, `${f}: the window is 24–48h, so "a day or two before"`);
  }
});

test("checkout and welcome: the trial stated as dated terms, not an undated 'cancel any time'", () => {
  const checkout = code("src/app/api/premium/checkout/route.ts");
  assert.match(checkout, /\.\.\.\(trialEligible \? \{ custom_text: \{ submit: \{ message: trialMessage \} \} \} : \{\}\)/);
  assert.match(checkout, /We'll email you a day or two before your \$\{PREMIUM_TRIAL_DAYS\}-day trial ends/);
  const welcome = code("src/app/premium/welcome/page.tsx");
  assert.match(welcome, /expand: \["subscription", "subscription\.items\.data\.price"\]/);
  assert.match(welcome, /endsAt: new Date\(sub\.trial_end \* 1000\)/, "dates from the subscription, not PREMIUM_TRIAL_DAYS arithmetic");
  assert.match(welcome, /Manage your subscription/, "cancelling stays one click away");
  assert.match(welcome, /href=\{back \?\? "\/dashboard"\}/);
  assert.doesNotMatch(welcome, /days left|countdown/i);
  assert.match(read("src/components/PremiumActivationPoller.tsx"), /Trial started ✓ — nothing charged/);
});

test("the trialist welcome email: the terms, the reminder, the manage link — never the free pitch", () => {
  const endsAt = new Date("2026-09-28T12:00:00Z");
  const e = buildTrialWelcomeEmail({ displayName: "Sam Lee", planName: "Premium", endsAt, chargeLine: "US$4.99/mo (half price), then US$9.99/mo", cancelling: false });
  assert.match(e.html, /September 28, 2026/);
  assert.match(e.html, /US\$4\.99\/mo \(half price\), then US\$9\.99\/mo unless you cancel/);
  assert.match(e.html, /a day or two before/);
  assert.match(e.html, /\/premium\?utm_source=email/);
  assert.doesNotMatch(e.html, /See Premium|three biggest deals/);
  const c = buildTrialWelcomeEmail({ displayName: "Sam", planName: "Plus", endsAt, chargeLine: "US$2.49/mo", cancelling: true });
  assert.match(c.html, /you won't be charged/);
  assert.doesNotMatch(c.html, /unless you cancel/);
  assert.doesNotMatch(c.html, /best-basket/, "Best Basket is Premium-only");
  assert.match(code("src/lib/welcome-email.ts"), /const trial = u\.trialStartedAt \? await liveTrial\(u\.stripeCustomerId\) : null;/);
});

test("the report counts a save, which Stripe otherwise erases by clearing the cancel", () => {
  const base: TrialRow = {
    status: "trialing", trialStartMs: 0, trialEndMs: 3 * 86_400_000, cancelAtPeriodEnd: false, canceledAtMs: null,
    endedAtMs: null, reason: null, feedback: null, comment: null, tier: "premium", interval: "month", surface: null,
    matchedUser: true, accountAgeDaysAtTrial: 0, signupSource: null, activeDays: 1, alerts: 0, collectionCards: 0,
    reminderSentMs: null, trialDays: 3,
  };
  assert.equal(classifyTrial({ ...base, keptAtMs: 3_600_000, keptVia: "resume" }, 86_400_000).outcome, "resumed");
  assert.equal(classifyTrial({ ...base, resumedByEvent: true }, 86_400_000).outcome, "resumed");
  assert.equal(classifyTrial({ ...base, keptAtMs: 1, cancelAtPeriodEnd: true }, 86_400_000).outcome, "cancelled_in_trial", "cancelled again after keeping");
  assert.equal(classifyTrial(base, 86_400_000).outcome, "in_trial");
  const script = code("scripts/trial-cancel-report.ts");
  assert.doesNotMatch(script, /\.(create|update|del)\(/, "read-only");
});

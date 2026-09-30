import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  buildTrialEndingEmail,
  buildTrialEndingNoChargeEmail,
  buildCheckoutRecoveryEmail,
  buildTrialWelcomeEmail,
} from "../src/lib/email";
import { PREMIUM_TRIAL_DAYS, PREMIUM_TRIAL_FEE_CENTS, parseTrialEnv, parseTrialFeeCents, trialFeeCentsOf } from "../src/lib/premium";
import { premiumTrialFee, trialButtonLabel, trialThenLine, trialOfferLead } from "../src/lib/site";

// The $1 first month (2026-09-30, DECISIONS.md, "A $1 first month for both
// tiers"): every place that describes the trial must say what it really is, a
// paid trial, and must never say "free trial", "$0 today" or "nothing was charged"
// while the fee is above zero. The knobs, the reminder and the other trial emails,
// and a sweep of the source for stray free-trial wording.

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
const ENDS = new Date("2026-10-30T12:00:00Z");

test("the defaults are the $1 first month: 30 days, 100 cents", () => {
  assert.equal(PREMIUM_TRIAL_DAYS, 30);
  assert.equal(PREMIUM_TRIAL_FEE_CENTS, 100);
  assert.equal(premiumTrialFee(PREMIUM_TRIAL_FEE_CENTS), "$1");
  assert.equal(trialButtonLabel(PREMIUM_TRIAL_DAYS, PREMIUM_TRIAL_FEE_CENTS), "Start 30 days for $1");
  assert.equal(trialThenLine(PREMIUM_TRIAL_DAYS, PREMIUM_TRIAL_FEE_CENTS, "$2.99/mo"), "First 30 days for $1, then $2.99/mo");
});

test("the env knobs: unset or blank means the default, 0 is the kill switch, junk never turns the trial free", () => {
  assert.equal(parseTrialEnv(undefined, 30), 30);
  assert.equal(parseTrialEnv("", 30), 30, "a blank Vercel value is not a kill switch");
  assert.equal(parseTrialEnv("  ", 30), 30);
  assert.equal(parseTrialEnv("0", 30), 0, "PREMIUM_TRIAL_DAYS=0 is the kill switch");
  assert.equal(parseTrialEnv("14", 30), 14, "a leftover 14 wins over the default, which is why it must be removed");
  assert.equal(parseTrialEnv("abc", 30), 30);
  assert.equal(parseTrialEnv("-5", 30), 0);
  assert.equal(parseTrialFeeCents(undefined), 100);
  assert.equal(parseTrialFeeCents(""), 100, "a blank fee must not silently make the trial free");
  assert.equal(parseTrialFeeCents("0"), 0, "an explicit 0 is a genuinely free trial");
  assert.equal(parseTrialFeeCents("199"), 199);
  assert.equal(parseTrialFeeCents("25"), 100, "under Stripe's minimum charge it would fail every checkout: back to the default");
  assert.equal(parseTrialFeeCents("nope"), 100);
});

test("what a customer paid to start comes off the subscription's own metadata, never the current constant", () => {
  assert.equal(trialFeeCentsOf({ metadata: { trialFeeCents: "100" } }), 100);
  assert.equal(trialFeeCentsOf({ metadata: { trialFeeCents: "0" } }), 0);
  assert.equal(trialFeeCentsOf({ metadata: {} }), 0, "a 3- or 14-day trial from before the fee existed was free");
  assert.equal(trialFeeCentsOf(null), 0);
});

test("the reminder says 'your trial ends', quotes the plan price it will charge, and admits the $1 was paid", () => {
  const e = buildTrialEndingEmail({ chargeDate: ENDS, amountLabel: "$2.99/month", planName: "Plus", paidCents: 100 });
  const t = text(e.html);
  assert.match(e.subject, /Your RiftCompare Plus trial ends October 30, 2026/);
  assert.match(t, /Your RiftCompare Plus trial ends on October 30, 2026\s*\./);
  assert.match(t, /You paid \$1 to start it\./);
  assert.match(t, /the card on file will be charged \$2\.99\/month and your subscription continues automatically/);
  assert.match(t, /Unless you cancel before then/);
  assert.match(t, /Manage subscription/);
  for (const bad of [/free trial/i, /nothing was charged/i, /nothing will be charged/i, /no charge/i]) {
    assert.doesNotMatch(e.subject + " " + e.html, bad, `a $1 trial reminder must not say ${bad}`);
  }
  // Annual and Premium quote their own price.
  const annual = text(buildTrialEndingEmail({ chargeDate: ENDS, amountLabel: "$39.99/year", planName: "Premium", paidCents: 100 }).html);
  assert.match(annual, /Premium trial ends on/);
  assert.match(annual, /charged \$39\.99\/year/);
});

test("a free trial that already exists (paid nothing) is not told it paid $1", () => {
  const t = text(buildTrialEndingEmail({ chargeDate: ENDS, amountLabel: "$2.99/month", planName: "Plus", paidCents: 0 }).html);
  assert.doesNotMatch(t, /You paid/);
  assert.match(t, /Your RiftCompare Plus trial ends on/);
});

test("a trial already set to end says nothing MORE will be charged, and offers Keep", () => {
  const e = buildTrialEndingNoChargeEmail({ endsAt: ENDS, planName: "Premium", keepLine: "US$4.99/mo" });
  const t = text(e.html);
  assert.match(t, /nothing more will be charged/);
  assert.match(t, /If you'd like to keep it, it's US\$4\.99\/mo/);
  assert.match(e.subject, /no further charge/);
  assert.match(e.html, /\/premium\?keep=1#keep/);
  assert.doesNotMatch(e.subject + e.html, /free trial|nothing will be charged|no charge\b/i);
});

test("the trial welcome names what was paid, then the price and date it converts", () => {
  const e = buildTrialWelcomeEmail({ displayName: "Sam", planName: "Plus", endsAt: ENDS, chargeLine: "US$2.99/mo", cancelling: false, paidCents: 100 });
  const t = text(e.html);
  assert.match(t, /Your Plus trial runs until October 30, 2026\s*\. You paid \$1 to start it\. Then it's US\$2\.99\/mo unless you cancel\./);
  assert.match(t, /a day or two before/);
  const c = text(buildTrialWelcomeEmail({ displayName: "Sam", planName: "Plus", endsAt: ENDS, chargeLine: null, cancelling: true, paidCents: 100 }).html);
  assert.match(c, /nothing more will be charged/);
});

test("the checkout-recovery email quotes the $1 and the plan price after it, and never calls it free", () => {
  const e = buildCheckoutRecoveryEmail(30, "from $2.00/mo billed yearly, or $2.99/month month-to-month", "plus", 100);
  const t = text(e.html);
  assert.match(e.subject, /first 30 days of RiftCompare Plus for \$1/);
  assert.match(t, /Your first 30 days are still \$1\. After that, Plus is from \$2\.00\/mo billed yearly/);
  assert.doesNotMatch(e.subject + t, /free trial|\$0 today/i);
  // No trial available: the plain price, no trial promised.
  const none = buildCheckoutRecoveryEmail(0, "$2.99/month", "plus", 100);
  assert.doesNotMatch(none.subject + text(none.html), /first 30 days|trial/i);
});

test("the copy helpers say 'free' only for a fee of 0", () => {
  assert.equal(trialOfferLead(30, 100), "First 30 days for $1");
  assert.equal(trialOfferLead(30, 0), "First 30 days free");
});

// A sweep of the source. While the fee is above zero no surface may say "free
// trial", "$0 today" or "nothing charged" unguarded. Every line that still does is
// the fee-0 branch of a fee check (PREMIUM_TRIAL_FEE_CENTS / trialFeeCents / paid /
// feeCents / trialFeeCents > 0), or the no-trial branch. New occurrences must join
// this list deliberately.
const SRC = join(process.cwd(), "src");
function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx)$/.test(name)) yield p;
  }
}
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

test("every remaining 'free trial' / '$0 today' / 'nothing charged' line is the fee-0 or no-trial branch of a fee check", () => {
  const FEE_GUARD = /PREMIUM_TRIAL_FEE_CENTS|trialFeeCents|feeCents|\bpaid\b|premiumTrialEnabled\(\)/;
  const allowed = new Set([
    "src/components/TrialPriceBlock.tsx",
    "src/components/PremiumActivationPoller.tsx",
    "src/app/premium/page.tsx",
    "src/app/premium/start/page.tsx",
    "src/app/premium/welcome/page.tsx",
    "src/app/terms/page.tsx",
    "src/lib/articles.ts",
    "src/lib/checkout-params.ts",
    "src/lib/email.ts",
    "src/lib/use-me.ts",
  ]);
  const found: string[] = [];
  for (const file of walk(SRC)) {
    const rel = file.slice(process.cwd().length + 1);
    const src = stripComments(readFileSync(file, "utf8"));
    const lines = src.split("\n");
    lines.forEach((line, i) => {
      if (!/free trial|free-trial|\$0 today|nothing (is )?charged today|nothing charged/i.test(line)) return;
      // The guard sits on the line itself or a few lines before it (a ternary branch, or a JSX conditional).
      // The feedback / referral grants ("nothing charged" on a free week of Premium, no card) are not the trial.
      if (/Neither of these requires ever entering a payment method/.test(line)) return;
      const around = lines.slice(Math.max(0, i - 12), i + 1).join("\n");
      if (!FEE_GUARD.test(around) && !/^\s*(?:\/\/|\*)/.test(line) && !/"No — Plus and Premium are billed from the day/.test(line) && !/no free trial/i.test(line)) {
        found.push(`${rel}:${i + 1}: ${line.trim().slice(0, 100)}`);
      }
      if (!allowed.has(rel)) found.push(`${rel}: not on the allow-list: ${line.trim().slice(0, 100)}`);
    });
  }
  assert.deepEqual(found, [], `unguarded free-trial wording:\n${found.join("\n")}`);
});

test("/premium stays short: one line per plan card, one trial FAQ entry, the buy buttons say 'Start 30 days for $1'", () => {
  const cards = readFileSync(join(SRC, "components/PremiumPricingCards.tsx"), "utf8");
  assert.equal((cards.match(/data-trial-offer/g) ?? []).length, 1, "one trial line, in the one card component both tiers use");
  assert.match(cards, /trialThenLine\(trialDays, trialFeeCents,/);
  assert.doesNotMatch(stripComments(cards), /free trial/i, "the cards never call the $1 first month a free trial");
  assert.doesNotMatch(stripComments(cards), /"N-day free trial"/, "the old trial feature bullet is gone: four bullets a card");
  const cta = readFileSync(join(SRC, "components/PremiumCta.tsx"), "utf8");
  assert.match(cta, /trialButtonLabel\(trialDays, trialFeeCents\)/);
  const page = stripComments(readFileSync(join(SRC, "app/premium/page.tsx"), "utf8"));
  const faq = page.slice(page.indexOf("const FAQ:"), page.indexOf("export default async function PremiumPage"));
  assert.equal((faq.match(/premiumTrialEnabled\(\)/g) ?? []).length, 2, "one FAQ entry behind the trial switch, plus the cancel answer's own clause");
  assert.match(faq, /You pay \$\{premiumTrialFee\(PREMIUM_TRIAL_FEE_CENTS\)\} today/);
  assert.match(faq, /A card is required\. We email you a day or two before day/);
  assert.match(faq, /you keep access to day \$\{PREMIUM_TRIAL_DAYS\} either way/);
  assert.doesNotMatch(faq, /you are never charged|(?<!plan price is )never charged/i, "the $1 is charged: only the plan price is avoided by cancelling");
  // The account card names what was paid.
  assert.match(page, /Trial · \$\{premiumTrialFee\(subDetails\.trialFeeCents\)\} paid/);
  assert.match(page, /Converts to \{subscriptionChargeLine\(subDetails\)/);
});

test("terms section 8 states the $1 trial factually and invents no refund policy", () => {
  const terms = stripComments(readFileSync(join(SRC, "app/terms/page.tsx"), "utf8"));
  const s8 = terms.slice(terms.indexOf("8. Plus and Premium subscriptions"), terms.indexOf("9. Store consulting"));
  assert.match(s8, /is charged when you start/, "the fee is charged up front");
  assert.match(s8, /Unless you cancel before day \{PREMIUM_TRIAL_DAYS\}, the plan&apos;s price for the period you chose/, "the plan price starts on day 30 unless cancelled");
  assert.match(s8, /We email you a day or two before day/, "the reminder");
  assert.match(s8, /limited to one per account and one per card/);
  // The ONLY refund statements: the standing clause, and the reused-card refund the webhook really gives.
  const refunds = s8.match(/[^.]*\brefund[^.]*\./gi) ?? [];
  assert.equal(refunds.length, 2, `unexpected refund wording: ${refunds.join(" | ")}`);
  assert.match(refunds.join(" "), /non-refundable except where required by law/);
  assert.match(refunds.join(" "), /breaks the one-per-card limit/);
});

// Owner, 2026-09-30: "Lapsed payers should not be offered." One rule, trialOfferedTo:
// never started a trial AND the Stripe customer has never paid.
test("the $1 month is offered through one rule that excludes anyone who has paid before", () => {
  const premium = readFileSync("src/lib/premium.ts", "utf8");
  assert.match(premium, /export async function trialOfferedTo\(/);
  const body = premium.slice(premium.indexOf("export async function trialOfferedTo("));
  assert.match(body.slice(0, 700), /premiumTrialEnabled\(\)[\s\S]*trialStartedAt[\s\S]*everPaidCached/);
  for (const f of [
    "src/app/api/premium/checkout/route.ts",
    "src/app/api/me/route.ts",
    "src/app/premium/page.tsx",
    "src/app/premium/start/page.tsx",
    "src/lib/welcome-email.ts",
  ]) {
    assert.match(readFileSync(f, "utf8"), /trialOfferedTo\(/, `${f} must ask trialOfferedTo`);
  }
  assert.doesNotMatch(readFileSync("src/app/api/premium/checkout/route.ts", "utf8"), /trialEligible = premiumTrialEnabled/);
});

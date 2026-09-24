import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildWelcomeEmail } from "../src/lib/email";

// The one-time welcome email to a new account (2026-09-23). Before it, a new
// account got no email at all. DECISIONS.md, "Premium after sign-up".

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");

test("the email leads with the free account, then states Premium's trial the standard way", () => {
  const e = buildWelcomeEmail({ displayName: "Sam Lee", trialDays: 14, fromLine: "$9.99/month", zeroToday: "$0 today" });
  const t = text(e.html);
  assert.match(t, /Hi Sam,/, "first name only");
  const order = ["Watch a card", "See today's top 3 deals", "Track your collection", "Want every deal"].map((s) => t.indexOf(s));
  assert.ok(order.every((i) => i > 0), "all four blocks present");
  assert.deepEqual([...order].sort((a, b) => a - b), order, "the free account comes first; Premium is the last block, not the headline");
  assert.match(t, /Try it free for 14 days — \$0 today, then \$9\.99\/month\./);
  assert.match(e.html, /\/premium\?src=welcome"/, "the Premium link is attributed (PremiumRecoveryBeacon → welcome-email)");
  assert.match(t, /We won't send it again\./, "the footer states it is one-time");
});

test("no trial is promised to an account that cannot have one", () => {
  const e = buildWelcomeEmail({ displayName: "Sam", trialDays: 0, fromLine: "$9.99/month", zeroToday: "$0 today" });
  const t = text(e.html);
  assert.doesNotMatch(t, /free for|\$0 today/);
  assert.match(t, /Premium is \$9\.99\/month\./);
});

test("the display name cannot inject markup", () => {
  const e = buildWelcomeEmail({ displayName: "<img src=x onerror=alert(1)> Bob", trialDays: 14, fromLine: "x", zeroToday: "y" });
  assert.doesNotMatch(e.html, /<img src=x/);
  const blank = buildWelcomeEmail({ displayName: "   ", trialDays: 14, fromLine: "x", zeroToday: "y" });
  assert.match(text(blank.html), /Hi there,/);
});

test("prices and the trial come from the shared helpers, never typed", () => {
  const src = read("src/lib/welcome-email.ts");
  assert.match(src, /fromLine: premiumFromLine\(\)/);
  assert.match(src, /zeroToday: premiumZeroToday\(\)/);
  assert.match(src, /trialDays: premiumTrialEnabled\(\) && !u\.trialStartedAt \? PREMIUM_TRIAL_DAYS : 0/);
  const tpl = read("src/lib/email.ts");
  const block = tpl.slice(tpl.indexOf("export function buildWelcomeEmail"), tpl.indexOf("function welcomeFooter"));
  assert.doesNotMatch(block, /\$\d/, "no hand-typed price in the template");
});

test("exactly once: a window, a conditional claim, and a released claim on failure", () => {
  const src = read("src/lib/welcome-email.ts");
  assert.match(src, /welcomeEmailSentAt: null,\s*isAdmin: false,\s*createdAt: \{ gte: /, "only unsent, non-admin accounts inside the window");
  assert.match(src, /NOT_SEED_WHERE/);
  assert.match(src, /export const WELCOME_WINDOW_HOURS = 72;/, "existing accounts are outside the window and never emailed");
  assert.match(src, /updateMany\(\{\s*where: \{ id: u\.id, welcomeEmailSentAt: null \}/, "claimed before sending");
  assert.match(src, /if \(claim\.count === 0\) continue;/);
  assert.match(src, /data: \{ welcomeEmailSentAt: null \}/, "a failed send releases the claim for the next run");
  assert.match(src, /take: BATCH/, "bounded query");
  assert.match(read("prisma/schema.prisma"), /welcomeEmailSentAt DateTime\?/, "additive, nullable column");
});

test("the cron route fails closed and the workflow runs hourly, tolerating a not-yet-deployed route", () => {
  const route = read("src/app/api/cron/welcome-email/route.ts");
  assert.match(route, /if \(!secret\) return false;/, "no CRON_SECRET, no sends");
  assert.match(route, /runWelcomeEmails\(\)/);
  const wf = read(".github/workflows/welcome-email.yml");
  assert.match(wf, /cron: "23 \* \* \* \*"/);
  assert.match(wf, /api\/cron\/welcome-email/);
  assert.match(wf, /if \[ "\$code" = "404" \]; then/);
});

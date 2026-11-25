import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { computeSubscriptionMetrics } from "../src/lib/subscription-metrics";
import { premiumReportSection } from "../src/lib/premium-report";

// Premium team (2026-11-26): the growth report carries Premium counts so the team can read them without a browser.

test("an empty Stripe account reads as zeros, not an error", () => {
  const s = premiumReportSection(computeSubscriptionMetrics([], Date.now()), { entitled: 3 });
  assert.match(s, /^PREMIUM \(Stripe, every site; counts only\)/);
  assert.match(s, /Paying now: 0 \(monthly 0, yearly 0\) \| in trial: 0/);
  assert.match(s, /Accounts with Premium today \(incl\. trials, comps, promos\): 3/);
});

test("not connected and errors say so, and never pretend to be zero", () => {
  assert.match(premiumReportSection(null), /Not connected/);
  assert.match(premiumReportSection(null, { entitled: null, error: true }), /Could not read Stripe/);
});

test("the section holds counts and totals only: no email, name or customer id field is ever read", () => {
  const src = readFileSync(join(__dirname, "../src/lib/premium-report.ts"), "utf8");
  assert.doesNotMatch(src, /\.email\b|\.customer\b|displayName/);
  const route = readFileSync(join(__dirname, "../src/app/api/cron/growth-report/route.ts"), "utf8");
  assert.match(route, /\$\{premium\}`/, "the section is appended to the growth report");
});

import test from "node:test";
import assert from "node:assert/strict";
import { computeSubscriptionMetrics, monthlyValueCents, type SubRow } from "../src/lib/subscription-metrics";

// Fixed clock so cohort months and 30d windows are deterministic.
const NOW = Date.UTC(2026, 7, 27); // 2026-08-27
const DAY = 86_400_000;
const ago = (d: number) => NOW - d * DAY;

function row(p: Partial<SubRow>): SubRow {
  return {
    status: "active",
    interval: "month",
    unitAmount: 499,
    currency: "usd",
    createdMs: ago(10),
    canceledAtMs: null,
    endedAtMs: null,
    trialEndMs: null,
    ...p,
  };
}

test("monthlyValueCents normalises a yearly plan to 1/12", () => {
  assert.equal(monthlyValueCents({ interval: "month", unitAmount: 499 }), 499);
  assert.equal(monthlyValueCents({ interval: "year", unitAmount: 3900 }), 325); // 3900/12 = 325
  assert.equal(monthlyValueCents({ interval: null, unitAmount: 999 }), 0);
});

test("empty account yields no fake numbers", () => {
  const m = computeSubscriptionMetrics([], NOW);
  assert.equal(m.active, 0);
  assert.equal(m.mrrCents, 0);
  assert.equal(m.arpuCents, 0);
  assert.equal(m.churnRatePct, null, "no subs → churn is unknown, not 0%");
  assert.equal(m.ltvCents, null);
  assert.equal(m.trialConvPct, null);
});

test("MRR, plan mix, ARPU, churn, LTV and cohorts compute correctly", () => {
  const rows: SubRow[] = [
    row({ createdMs: ago(5) }), // A: active monthly, new
    row({ createdMs: ago(40), trialEndMs: ago(26) }), // B: active monthly, trial converted
    row({ createdMs: ago(100) }), // C: active monthly, old
    row({ interval: "year", unitAmount: 3900, createdMs: ago(60), trialEndMs: ago(46) }), // D: active annual, converted
    row({ status: "trialing", createdMs: ago(3), trialEndMs: NOW + 11 * DAY }), // E: trialing (not MRR)
    row({ status: "canceled", createdMs: ago(50), canceledAtMs: ago(10), endedAtMs: ago(10), trialEndMs: ago(36) }), // F: churned 10d ago, trial not converted
    row({ currency: "aud", unitAmount: 699, createdMs: ago(20) }), // G: active monthly AUD
  ];
  const m = computeSubscriptionMetrics(rows, NOW);

  // Headline currency is the one with the most active subs → USD (4 vs AUD 1).
  assert.equal(m.currency, "usd");
  assert.equal(m.active, 4, "A,B,C,D are the active USD subs");
  assert.equal(m.monthlyActive, 3);
  assert.equal(m.annualActive, 1);
  assert.equal(m.trialing, 1, "E is trialing, counted apart from MRR");

  // MRR = 499*3 monthly + 3900/12 annual = 1497 + 325.
  assert.equal(m.mrrCents, 1822);
  assert.equal(m.arrCents, 1822 * 12);
  assert.equal(m.arpuCents, Math.round(1822 / 4)); // 456

  // Churn: F ended in the last 30d. 1 / (4 active + 1 churned) = 20%.
  assert.equal(m.churned30, 1);
  assert.equal(m.churnRatePct, 20);
  assert.equal(m.ltvCents, Math.round(456 / 0.2)); // ARPU / churn = 2280

  // New in the window counts EVERY row (all currencies/statuses): A(5d), E(3d) in 7d; +G(20d) in 30d.
  assert.equal(m.new7, 2);
  assert.equal(m.new30, 3);

  // Trial → paid: B and D converted; E still trialing, F canceled. 2 of 4.
  assert.equal(m.trialsStarted, 4);
  assert.equal(m.trialsConverted, 2);
  assert.equal(m.trialConvPct, 50);

  // Multi-currency: never summed across currencies.
  assert.equal(m.byCurrency.length, 2);
  const aud = m.byCurrency.find((b) => b.currency === "aud");
  assert.ok(aud && aud.active === 1 && aud.mrrCents === 699);

  // Cohorts by signup month, newest first.
  assert.equal(m.cohorts[0].month, "2026-08");
  assert.equal(m.cohorts[0].started, 3); // A, E, G
  assert.equal(m.cohorts[0].active, 3); // active or trialing all count as retained
  const jul = m.cohorts.find((c) => c.month === "2026-07");
  assert.ok(jul && jul.started === 2 && jul.active === 1 && jul.retentionPct === 50, "B stayed, F churned");
});

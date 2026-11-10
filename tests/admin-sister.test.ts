import test from "node:test";
import assert from "node:assert/strict";
import { planStatus, summarise, type SisterRow } from "../src/lib/admin-sister";

const now = new Date("2026-11-10T00:00:00Z");
const d = (s: string) => new Date(s);

test("planStatus tells trial, paid, lapsed, free and no account apart", () => {
  assert.equal(planStatus(null, now, 14), "no-account");
  assert.equal(planStatus({ premiumUntil: null, trialStartedAt: null }, now, 14), "free");
  assert.equal(planStatus({ premiumUntil: d("2026-11-01"), trialStartedAt: d("2026-10-01") }, now, 14), "lapsed");
  assert.equal(planStatus({ premiumUntil: d("2026-11-20"), trialStartedAt: d("2026-11-08") }, now, 14), "trial");
  assert.equal(planStatus({ premiumUntil: d("2026-12-20"), trialStartedAt: d("2026-09-01") }, now, 14), "paid");
  assert.equal(planStatus({ premiumUntil: d("2026-12-20"), trialStartedAt: null }, now, 14), "paid");
  assert.equal(planStatus({ premiumUntil: d("2026-12-20"), trialStartedAt: d("2026-11-09") }, now, 0), "paid");
});

test("summarise counts members, plans and conversion", () => {
  const row = (o: Partial<SisterRow>): SisterRow => ({ email: "a@b.c", member: true, alerts: 0, confirmed: false, plan: "free", premiumUntil: null, signedUp: d("2026-11-09"), lastSeen: null, ...o });
  const s = summarise([row({ plan: "paid" }), row({ plan: "trial" }), row({ plan: "free", signedUp: d("2026-10-01") }), row({ member: false, alerts: 2, plan: "no-account" })], now);
  assert.equal(s.people, 4);
  assert.equal(s.members, 3);
  assert.equal(s.alertEmails, 1);
  assert.equal(s.conversionPct, 33.3);
  assert.equal(s.new7, 3);
  assert.equal(s.new30, 3);
});

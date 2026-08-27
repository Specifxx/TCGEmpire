import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldEmailDrop, REMINDER_INTERVAL_MS } from "../src/lib/price-alerts";

// ─────────────────────────────────────────────────────────────────────────────
// Anti-spam: a price watch must not re-email a drop the subscriber already saw.
// ─────────────────────────────────────────────────────────────────────────────
// runPriceAlerts() advances lastPriceCents on every move, so a sawtooth price —
// $10 → $8 (emailed) → $10 → $8 → $10 → $8 … — used to send "$8!" every single
// time it dipped, because each dip was a drop against the most recent baseline.
// shouldEmailDrop() gates the SEND on a separate watermark: only a new low beats
// it, and a non-new-low drop is allowed through only when it has been ≈2 months
// since the last email (a "still cheap" nudge rather than spam).
//
// These call the pure decision directly. The baseline tracking, digest grouping
// and failed-send hold live in runPriceAlerts and are pinned by
// alert-baseline-hold.test.ts.

const NOW = new Date("2026-08-26T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

test("the reminder interval is about two months", () => {
  const days = REMINDER_INTERVAL_MS / (24 * 60 * 60 * 1000);
  assert.ok(days >= 55 && days <= 65, `expected ~60 days, got ${days}`);
});

test("first-ever drop always emails (no watermark yet)", () => {
  // lowestEmailedCents null = never emailed for this watch. The very first drop
  // must go out, and it seeds the watermark.
  assert.equal(
    shouldEmailDrop({ current: 800, lowestEmailedCents: null, lastNotifiedAt: null, now: NOW }),
    true
  );
});

test("a NEW low always emails, however recently we last emailed", () => {
  // Emailed $8 an hour ago; now it's $7. A genuine new low is always worth it.
  assert.equal(
    shouldEmailDrop({ current: 700, lowestEmailedCents: 800, lastNotifiedAt: daysAgo(0), now: NOW }),
    true
  );
});

test("a dip back to a price we already emailed is SUPPRESSED", () => {
  // The core anti-spam case: watermark $7, price sawtooths back down to $8.
  // $8 is a drop against a higher baseline, but not below the $7 we already sent,
  // and the last email was recent — stay quiet.
  assert.equal(
    shouldEmailDrop({ current: 800, lowestEmailedCents: 700, lastNotifiedAt: daysAgo(3), now: NOW }),
    false
  );
});

test("matching the watermark exactly is not a new low — suppressed", () => {
  // current == lowestEmailed. "Lower than the lowest emailed" means strictly lower.
  assert.equal(
    shouldEmailDrop({ current: 700, lowestEmailedCents: 700, lastNotifiedAt: daysAgo(3), now: NOW }),
    false
  );
});

test("a non-new-low drop resurfaces once ~2 months have passed", () => {
  // Same $8 dip, but the last email was over two months ago — a gentle nudge is
  // allowed now (and sending it will reset lastNotifiedAt, so it can't repeat
  // until another two months pass).
  assert.equal(
    shouldEmailDrop({ current: 800, lowestEmailedCents: 700, lastNotifiedAt: daysAgo(65), now: NOW }),
    true
  );
  // Just under the interval still holds.
  assert.equal(
    shouldEmailDrop({ current: 800, lowestEmailedCents: 700, lastNotifiedAt: daysAgo(59), now: NOW }),
    false
  );
});

test("exactly at the interval boundary emails (>= interval)", () => {
  const at = new Date(NOW.getTime() - REMINDER_INTERVAL_MS);
  assert.equal(
    shouldEmailDrop({ current: 800, lowestEmailedCents: 700, lastNotifiedAt: at, now: NOW }),
    true
  );
});

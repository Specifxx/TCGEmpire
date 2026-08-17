import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const src = stripComments(readFileSync(join(ROOT, "src/lib/price-alerts.ts"), "utf8"));

// ─────────────────────────────────────────────────────────────────────────────
// A price drop the subscriber was never told about must stay pending.
// ─────────────────────────────────────────────────────────────────────────────
// runPriceAlerts() compares each card's current lowest price against the last one
// recorded, emails the drops, then advances the baseline. The ordering was right
// and documented — "Done after sending so a send failure doesn't swallow the drop
// (we'd retry it on the next run)" — but only the ORDER was implemented. The
// `sent` flag from sendPriceDropEmail() fed nothing but a counter, and the
// baseline advanced regardless.
//
// So a bounced or rate-limited digest lost the drop permanently: the baseline was
// already the new, lower price, the next run compared it against itself, found no
// drop, and the alert the subscriber explicitly asked for never fired. Silent by
// construction — the run reports `updated` either way, and the row looks healthy.
//
// Only the drop-bearing alerts of a FAILED digest are held. A rise, or a
// first-ever observation, sends no email and must still advance, or one bad
// address would freeze baselines that have nothing to do with it.

test("a failed digest holds its alerts' baselines back", () => {
  assert.match(src, /failedEmails/, "the send loop must record which digests failed");
  assert.match(
    src,
    /else failedEmails\.add\(email\)/,
    "sendPriceDropEmail's false return is the only signal a digest was lost"
  );
  assert.match(
    src,
    /heldIds/,
    "the failed addresses have to be turned back into the alert rows to hold"
  );
});

test("the baseline write applies the filtered set, not the raw one", () => {
  // The bug was one identifier wide: `updates` instead of the filtered list.
  const write = /\$transaction\(([\s\S]*?)\);/.exec(src);
  assert.ok(write, "the baseline $transaction moved — re-derive this test");
  assert.match(
    write[1],
    /dueUpdates\.map/,
    "the transaction must write the filtered baselines; writing `updates` " +
      "advances past a drop nobody was told about"
  );
  const notified = /updateMany\(\{([\s\S]*?)\}\);/.exec(src);
  assert.ok(notified, "the lastNotifiedAt updateMany moved — re-derive this test");
  assert.match(
    notified[1],
    /dueNotifiedIds/,
    "lastNotifiedAt must not claim a notification that failed to send"
  );
});

test("only alerts that actually carried a drop are held", () => {
  // Holding every alert for a failed address would also freeze rises, which were
  // never emailed and have no reason to wait.
  assert.match(
    src,
    /notifiedSet\.has\(a\.id\)/,
    "the held set must intersect with the alerts that produced a drop item"
  );
});

test("the run reports what it deliberately did not write", () => {
  // `updated` alone can't distinguish "nothing moved" from "we held three back",
  // which is what made the original failure invisible in the cron's output.
  assert.match(src, /held:\s*number/, "AlertRunSummary needs a `held` field");
  assert.match(src, /summary\.held\s*=/, "the run must populate `held`");
});

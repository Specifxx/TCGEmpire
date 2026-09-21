import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { addressInCooldown, MIN_DIGEST_INTERVAL_MS, shouldEmailDrop } from "../src/lib/price-alerts";

const ROOT = process.cwd();
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const src = stripComments(readFileSync(join(ROOT, "src/lib/price-alerts.ts"), "utf8"));

// ─────────────────────────────────────────────────────────────────────────────
// "Can we make price drop emails less frequent? like once every week."
//
// Before this, shouldEmailDrop() sent a new all-time low IMMEDIATELY and always
// — correct per card, and collectively spam: somebody watching a dozen cards in
// a falling market could receive a digest every single day, each one
// individually justified.
//
// The cap is a SECOND, independent gate, and keeping the two separate is the
// whole design:
//   • shouldEmailDrop()   — is this drop worth telling someone about? Per CARD.
//   • addressInCooldown() — may we tell them anything yet?         Per ADDRESS.
//
// The thing that makes it safe is that a capped drop is DEFERRED, not dropped.
// Its baseline is held back, so it re-detects on every subsequent run until the
// window opens and lands in the next digest — reporting the fall from the
// pre-drop price rather than from one day's step. Without the hold, the baseline
// would advance past a drop nobody was ever told about, which is exactly the
// silent failure tests/alert-baseline-hold.test.ts exists to prevent.
// ─────────────────────────────────────────────────────────────────────────────

const NOW = new Date("2026-09-21T18:30:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

test("the cap is one week", () => {
  assert.equal(MIN_DIGEST_INTERVAL_MS / (24 * 60 * 60 * 1000), 7);
});

test("a subscriber who has never been emailed is not in cooldown", () => {
  // The first drop a new watcher ever gets must arrive at once — a week's
  // silence after signing up would read as the feature being broken.
  assert.equal(addressInCooldown({ lastEmailedAt: null, now: NOW }), false);
});

test("emailed inside the last week → quiet; a week or more ago → allowed", () => {
  for (const d of [0, 1, 3, 6]) {
    assert.equal(addressInCooldown({ lastEmailedAt: daysAgo(d), now: NOW }), true, `${d} days ago must stay quiet`);
  }
  for (const d of [7, 8, 30]) {
    assert.equal(addressInCooldown({ lastEmailedAt: daysAgo(d), now: NOW }), false, `${d} days ago must be allowed`);
  }
});

test("the boundary is inclusive — exactly one week later sends", () => {
  const at = new Date(NOW.getTime() - MIN_DIGEST_INTERVAL_MS);
  assert.equal(addressInCooldown({ lastEmailedAt: at, now: NOW }), false);
  assert.equal(addressInCooldown({ lastEmailedAt: new Date(at.getTime() + 1), now: NOW }), true);
});

test("the cap does NOT replace the per-card policy — both still gate a send", () => {
  // A new all-time low is still 'worth sending' on its own terms; the cap is what
  // decides when. Collapsing the two would lose the distinction between "this
  // drop is not interesting" and "this drop is interesting but can wait".
  assert.equal(
    shouldEmailDrop({ current: 700, lowestEmailedCents: 800, lastNotifiedAt: daysAgo(1), now: NOW }),
    true,
    "a new low is still worth sending — the ADDRESS cooldown is what defers it",
  );
  assert.match(src, /shouldEmailDrop\(\{/, "the per-card gate must still be called");
  assert.match(src, /quiet\(a\.email\)/, "…and the per-address gate applied after it");
});

test("a deferred drop holds its baseline, so it is postponed and not lost", () => {
  // The single most important property here. If the baseline advanced, the next
  // run would compare the new low against itself, see no drop, and the email
  // would never arrive at all.
  assert.match(src, /deferredIds\.add\(a\.id\)/, "a capped drop must be recorded");
  assert.match(
    src,
    /const heldIds = new Set<string>\(deferredIds\)/,
    "deferred alerts must seed the held set — that is what stops the baseline advancing",
  );
  // And the pre-existing reason for holding (a failed digest) must survive.
  assert.match(src, /failedEmails\.has\(a\.email\) && notifiedSet\.has\(a\.id\)/);
});

test("a deferred drop does not stamp lastNotifiedAt or the watermark", () => {
  // Both are written only for alerts in dueNotifiedSet, built from notifiedIds.
  // The two arms are mutually exclusive branches of one if/else-if/else — an id
  // added to deferredIds is added there INSTEAD of being pushed to notifiedIds,
  // never both — so asserting that directly is the real guarantee.
  assert.match(
    src,
    /else if \(quiet\(a\.email\)\) \{[\s\S]*?deferredIds\.add\(a\.id\);[\s\S]*?\} else \{[\s\S]*?notifiedIds\.push\(a\.id\);/,
    "deferral and notification must be exclusive branches, not both reachable for the same alert",
  );
  assert.match(src, /if \(dueNotifiedSet\.has\(u\.id\)\)/);
});

test("two cards dropping the same day share one digest, not two", () => {
  // byEmail already grouped them, but the cooldown map has to learn about the
  // send within the same run or a later row for the same address could open a
  // second one.
  assert.match(
    src,
    /lastEmailedByAddress\.set\(a\.email, now\.getTime\(\)\)/,
    "queueing a digest must start this address's cooldown for the rest of the run",
  );
});

test("the run reports deferrals separately from suppressions", () => {
  // They mean opposite things: `suppressed` is "we decided not to tell them",
  // `deferred` is "we will tell them, later". One number for both would hide a
  // backlog building up behind the cap.
  assert.match(src, /deferred:\s*number/, "AlertRunSummary needs a `deferred` field");
  assert.match(src, /summary\.deferred\+\+/, "the run must populate it");
  assert.match(src, /summary\.suppressed\+\+/, "and still count true suppressions apart from it");
});

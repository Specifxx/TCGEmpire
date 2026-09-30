import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MAX_NUDGE_DISMISSALS,
  SNOOZE_AFTER_CLICK_MS,
  SNOOZE_AFTER_DISMISS_MS,
} from "../src/lib/nudge-timing";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const SLIDE = "src/components/PremiumSlideIn.tsx";
const ANNUAL = "src/components/AnnualSwitchNudge.tsx";

// ─────────────────────────────────────────────────────────────────────────────
// HOW OFTEN A CORNER NUDGE MAY ASK (2026-09-14). See DECISIONS.md.
//
// The signed-out sign-up popup had NO lifetime cap when this file was written:
// it came back every few pages after every dismissal, forever, and a new tab
// wiped its counters. The recorded dismiss rate was 78%. The shared cap below
// was the fix; the popup itself was removed on 2026-09-30 ("The sign-up slider
// is gone: sign-up prompts live in the page"), so its own tests went with it and
// the signed-in PremiumSlideIn is the cap's consumer.
//
// THE ASK THAT PRODUCED THIS CHANGE WAS THE OPPOSITE ONE: make the close button
// wait five seconds before it works. That was declined and the owner chose a
// frequency cap instead. The guard below is what stops the locked-✕ idea
// arriving quietly later, because it will come back.
// ─────────────────────────────────────────────────────────────────────────────

test("the cap has exactly one definition, and the slide-in consumes it", () => {
  assert.equal(MAX_NUDGE_DISMISSALS, 2, "two firm no's is a no");
  assert.equal(SNOOZE_AFTER_DISMISS_MS, 7 * 864e5, "a week of quiet after a dismissal");
  assert.equal(SNOOZE_AFTER_CLICK_MS, 14 * 864e5, "a fortnight after an engaged click");
  assert.ok(
    SNOOZE_AFTER_CLICK_MS > SNOOZE_AFTER_DISMISS_MS,
    "engaging must buy MORE quiet than refusing, or the incentives are backwards",
  );
  for (const f of [SLIDE]) {
    assert.match(code(f), /from "@\/lib\/nudge-timing"/, `${f} must import the shared cap`);
    assert.ok(
      !/const MAX_NUDGE_DISMISSALS\s*=/.test(code(f)),
      `${f} must not redeclare the cap — one definition, imported everywhere`,
    );
  }
});

// ── The guard against what was asked for and declined ───────────────────────

test("no corner nudge may gate, delay or disable its own close control", () => {
  // The ask on 2026-09-14 was a five-second wait before the ✕ works. Declined:
  // it is the pattern the Better Ads Standards name ("ads with countdown"),
  // docs/adsense-remediation.md already treats those Standards as a live
  // constraint on this site, six other tests forbid countdown pressure on
  // Premium surfaces, and the retired sign-up popup once caused a production incident
  // by being hard to close. The dismiss control must work from first paint.
  for (const f of [SLIDE, ANNUAL]) {
    const src = code(f);
    // Find every element that closes the thing, and prove none is disabled or
    // conditionally rendered on a timer.
    assert.ok(!/disabled=\{[^}]*(canDismiss|dismissable|closeable|canClose|waited|elapsed)/i.test(src),
      `${f}: the close control must never be disabled on a timer`);
    assert.ok(!/aria-disabled/.test(src), `${f}: no aria-disabled — that includes the close control`);
    // A second timer whose only job is to unlock dismissal.
    assert.ok(!/(canDismiss|dismissEnabled|allowClose|unlockClose)/i.test(src),
      `${f}: no "may they close it yet" state`);
  }
  // And the dismiss handler must be bound directly, not behind a predicate.
  for (const f of [SLIDE, ANNUAL]) assert.match(code(f), /onClick=\{dismiss\}/, `${f}: the ✕ must call dismiss directly`);
});

// ── Every corner card is easy to close (2026-09-29, "Nudges: value first") ──

test("both corner cards: a labelled ≥44px ✕, Escape that yields to an open dialog, and no slide under reduced motion", () => {
  for (const f of [SLIDE, ANNUAL]) {
    const src = code(f);
    const btn = src.slice(src.lastIndexOf("<button", src.indexOf("✕")), src.indexOf("✕"));
    assert.match(btn, /aria-label="Dismiss"/, `${f}: the ✕ is labelled`);
    assert.match(btn, /min-h-11 min-w-11/, `${f}: the ✕ is at least 44px at every width`);
    assert.match(src, /e\.key === "Escape" && document\.body\.dataset\.rcDialog !== "1"/, `${f}: Escape closes it, but belongs to an open dialog first`);
    assert.match(src, /motion-safe:translate-y-4 motion-safe:opacity-0/, `${f}: the slide is motion-safe only`);
    assert.match(src, /above-bottombar fixed left-4[^"]*w-\[calc\(100%-2rem\)\]/, `${f}: a bottom card with a gutter, not a full-width overlay`);
  }
});

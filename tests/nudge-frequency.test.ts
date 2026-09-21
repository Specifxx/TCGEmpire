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

const POPUP = "src/components/SignupPromoPopup.tsx";
const SLIDEIN = "src/components/PremiumSlideIn.tsx";

// ─────────────────────────────────────────────────────────────────────────────
// HOW OFTEN A CORNER NUDGE MAY ASK (2026-09-14). See DECISIONS.md.
//
// SignupPromoPopup had NO lifetime cap — its own header admitted it. It came
// back every few pages after every dismissal, forever, and because both its
// counters were sessionStorage, a new tab wiped them and the visitor was asked
// again on their first page. Someone could decline it indefinitely and keep
// being asked. That is what makes a ✕ reflexive rather than considered, and the
// recorded dismiss rate was 78%.
//
// THE ASK THAT PRODUCED THIS CHANGE WAS THE OPPOSITE ONE: make the close button
// wait five seconds before it works. That was declined and the owner chose a
// frequency cap instead. The last test in this file is what stops the locked-✕
// idea arriving quietly later, because it will come back.
// ─────────────────────────────────────────────────────────────────────────────

test("the cap has exactly one definition, and both nudges consume it", () => {
  assert.equal(MAX_NUDGE_DISMISSALS, 2, "two firm no's is a no");
  assert.equal(SNOOZE_AFTER_DISMISS_MS, 7 * 864e5, "a week of quiet after a dismissal");
  assert.equal(SNOOZE_AFTER_CLICK_MS, 14 * 864e5, "a fortnight after an engaged click");
  assert.ok(
    SNOOZE_AFTER_CLICK_MS > SNOOZE_AFTER_DISMISS_MS,
    "engaging must buy MORE quiet than refusing, or the incentives are backwards",
  );
  for (const f of [POPUP, SLIDEIN]) {
    assert.match(code(f), /from "@\/lib\/nudge-timing"/, `${f} must import the shared cap`);
    assert.ok(
      !/const MAX_NUDGE_DISMISSALS\s*=/.test(code(f)),
      `${f} must not redeclare the cap — one definition, imported everywhere`,
    );
  }
});

test("the popup enforces a LIFETIME cap and a snooze, before it arms its timer", () => {
  const src = code(POPUP);
  assert.match(src, />= MAX_NUDGE_DISMISSALS\) return/, "two dismissals must end it permanently");
  assert.match(src, /Date\.now\(\) < readLocal\(SNOOZE_UNTIL_KEY\)\) return/, "the snooze must be honoured");

  // Both checks must sit BEFORE the setTimeout, or the popup still slides in
  // for someone it has already stopped asking.
  const capAt = src.indexOf("MAX_NUDGE_DISMISSALS) return");
  const snoozeAt = src.indexOf("SNOOZE_UNTIL_KEY)) return");
  const armAt = src.indexOf("setTimeout(");
  assert.ok(capAt >= 0 && snoozeAt >= 0 && armAt >= 0, "expected both gates and the timer");
  assert.ok(capAt < armAt, "the lifetime cap must be checked before arming");
  assert.ok(snoozeAt < armAt, "the snooze must be checked before arming");
});

test("the popup's lifetime counters survive a new tab — the whole point of them", () => {
  const src = code(POPUP);
  // The two pre-existing keys are sessionStorage BY DESIGN (within-session
  // spacing). The two new ones must not be, or the cap resets on every visit
  // and nothing has actually changed.
  assert.match(src, /const DISMISS_COUNT_KEY = "rc_signup_promo_dismisses"/);
  assert.match(src, /const SNOOZE_UNTIL_KEY = "rc_signup_promo_until"/);
  assert.match(src, /window\.localStorage\.getItem/, "the lifetime reads must use localStorage");
  assert.match(src, /window\.localStorage\.setItem/, "and so must the writes");
  // The reads must fail open, exactly like every other storage read here, so a
  // private window behaves as it did before rather than throwing.
  const readLocal = src.slice(src.indexOf("function readLocal"), src.indexOf("function writeLocal"));
  assert.match(readLocal, /catch \{/, "readLocal must fail open");
});

test("dismissing burns a strike; engaging the CTA does not", () => {
  const src = code(POPUP);
  const dismiss = src.slice(src.indexOf("const dismiss = useCallback"), src.indexOf("const snoozeForClick"));
  assert.match(dismiss, /writeLocal\(DISMISS_COUNT_KEY, readLocal\(DISMISS_COUNT_KEY\) \+ 1\)/, "a dismissal must increment the lifetime count");
  assert.match(dismiss, /SNOOZE_AFTER_DISMISS_MS/, "and start the quiet stretch");

  const snooze = src.slice(src.indexOf("const snoozeForClick"), src.indexOf("const snoozeForClick") + 400);
  assert.match(snooze, /SNOOZE_AFTER_CLICK_MS/, "an engaged click must snooze");
  assert.ok(!/DISMISS_COUNT_KEY/.test(snooze), "an engaged click must NOT burn a permanent strike");
  // And it has to actually be wired to the provider buttons.
  assert.match(src, /onProviderClick=\{snoozeForClick\}/, "the snooze must be attached to AuthForm's existing hook");
});

test("the within-session spacing is untouched — the cap sits on top of it", () => {
  const src = code(POPUP);
  assert.match(src, /const PAGES_BETWEEN_SHOWS = \d+/, "the cadence must stay a named constant");
  assert.match(src, /views - dismissedAt < PAGES_BETWEEN_SHOWS\) return;/, "the page-spacing arithmetic must not have changed");
  assert.match(src, /sessionStorage\.setItem\(DISMISSED_AT_KEY, String\(readCount\(VIEWS_KEY\)\)\)/, "and it must still stamp where they were");
});

test("the frequency change is separable in GA4 from the uncapped era", () => {
  // PROMO_VARIANT tracks whichever value is current rather than re-pinning one
  // era forever; the file's own changelog carries the full list. It is now
  // "free_account_compare_subtle" (2026-09-16), the owner's reversal back to a
  // free-account pitch — the largest swing yet on the CONTENT axis, since the
  // ASK itself changed from "buy Premium" to "make a free account". Nothing in
  // the premium_graphic_* buckets is comparable to it, which is exactly why it
  // needed a new name instead of a suffix.
  //
  // Every retired name is checked as an EXACT string, not a substring: the
  // names in this family are prefixes of one another, so a substring check
  // would fire on the legitimate current value.
  const src = code(POPUP);
  assert.match(src, /const PROMO_VARIANT = "free_account_compare_subtle"/, "expected the current variant name");
  for (const retired of [
    "premium_graphic_5s_motion",
    "premium_graphic_5s",
    "premium_graphic_table",
    "premium_graphic_capped",
  ]) {
    assert.ok(
      !new RegExp(`const PROMO_VARIANT = "${retired}"`).test(src),
      `${retired} must be retired, not carried forward — the Premium-pitch eras must not blend into this one in GA4`,
    );
  }
});

// ── The guard against what was asked for and declined ───────────────────────

test("no corner nudge may gate, delay or disable its own close control", () => {
  // The ask on 2026-09-14 was a five-second wait before the ✕ works. Declined:
  // it is the pattern the Better Ads Standards name ("ads with countdown"),
  // docs/adsense-remediation.md already treats those Standards as a live
  // constraint on this site, six other tests forbid countdown pressure on
  // Premium surfaces, and the popup has already caused one production incident
  // by being hard to close. The dismiss control must work from first paint.
  for (const f of [POPUP, SLIDEIN, "src/components/AnnualSwitchNudge.tsx"]) {
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
  assert.match(code(POPUP), /onClick=\{dismiss\}/, "the ✕ must call dismiss directly");
  assert.match(code(SLIDEIN), /onClick=\{dismiss\}/, "same for the slide-in");
});

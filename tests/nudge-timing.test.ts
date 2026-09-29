import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  MAX_NUDGE_DISMISSALS,
  NUDGE_DELAY_MS,
  SNOOZE_AFTER_CLICK_MS,
  SNOOZE_AFTER_DISMISS_MS,
} from "../src/lib/nudge-timing";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const readCode = (p: string) =>
  read(p).replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, "");

// ─────────────────────────────────────────────────────────────────────────────
// Asked for directly, 2026-09-11: "have the premium slider show up 5 seconds
// after the page opens", then clarified — "change all sliders we have to show
// up 5 seconds after rather than instant".
//
// ALL of them, one number. The three corner nudges had three different answers
// arrived at separately — instant, 12s and 8s — with nothing connecting them,
// which is how they drifted apart in the first place. A visitor does not
// experience "the signup popup" or "the premium slide-in"; they experience
// things appearing in the corner of the page.
// ─────────────────────────────────────────────────────────────────────────────

const NUDGES = [
  "src/components/SignupPromoPopup.tsx", // signed-out: make a free account
  "src/components/PremiumSlideIn.tsx", // signed-in free: Premium (removed 2026-09-28, restored 2026-09-29)
  "src/components/AnnualSwitchNudge.tsx", // monthly subscriber: switch to annual
];
const RUNTIME = "src/lib/nudge-runtime.ts";

test("the shared delay is twelve seconds (owner, 2026-09-29: \"make the delay slightly longer\")", () => {
  // 5 s from 2026-09-11; instant on the morning of 2026-09-29 ("I want to bring
  // the instant feature back"); 12 s that afternoon: "make the login slider less
  // annoying again and focus on getting visitors to use the site rather than
  // annoy them. Make the delay slightly longer." Longer than the 5 s it replaced
  // AND longer than instant, on every corner nudge, from one constant.
  assert.equal(NUDGE_DELAY_MS, 12_000);
  assert.ok(NUDGE_DELAY_MS > 5_000, "slightly longer than the last non-instant delay");
});

test("every corner nudge waits the shared delay before showing, through the shared timer", () => {
  for (const f of NUDGES) {
    const code = readCode(f);
    // The show timer is armNudge (lib/nudge-runtime.ts), and the delay handed to
    // it must be the shared constant, used directly.
    assert.match(code, /armNudge\(\{/, `${f} must use the shared show timer`);
    assert.match(code, /delayMs: NUDGE_DELAY_MS/, `${f} must use the shared delay as the show timer, not merely import it`);
  }
});

test("no nudge keeps a private copy of the delay", () => {
  // The exact failure this module exists to prevent: three files, three
  // separately-maintained numbers. Same discipline as isPromoProduct and
  // investedCents — one definition, imported everywhere.
  for (const f of NUDGES) {
    const code = readCode(f);
    assert.doesNotMatch(
      code,
      /const\s+\w*(DWELL|DELAY)\w*_MS\s*=/,
      `${f} must not declare its own dwell/delay constant — import NUDGE_DELAY_MS`,
    );
  }
});

test("a pending show is cancelled if the visitor navigates away first", () => {
  // Twelve seconds is long enough to leave. Without cleanup the nudge fires
  // against a page that is gone, including one the component's own skipped
  // paths would have refused. Each nudge returns armNudge's cleanup (or, for
  // the annual offer, calls it from its effect's), and that cleanup clears the
  // timer.
  for (const f of NUDGES) {
    const code = readCode(f);
    assert.match(code, /return armNudge\(\{|stopTimer\?\.\(\)/, `${f} must clean up its pending show on unmount/route change`);
  }
  const runtime = readCode(RUNTIME);
  const arm = runtime.slice(runtime.indexOf("export function armNudge"), runtime.indexOf("// ── Engaged time"));
  assert.match(arm, /return \(\) => \{\s*done = true;\s*clear\(\);/, "the cleanup must stop and clear the timer for good");
});

test("the modal yield is checked when the timer FIRES, not only when it is armed", () => {
  // A modal can open during the wait. Checking only at arm time would let the
  // nudge slide in over a visitor who started writing feedback ten seconds ago:
  // the exact thing the rcDialog flag exists to prevent. attempt() is what the
  // timer runs, and it asks quietWaitMs (which returns a wait while a dialog is
  // open) before it calls onFire.
  const runtime = readCode(RUNTIME);
  const attempt = runtime.slice(runtime.indexOf("const attempt = () =>"), runtime.indexOf("const onFocusIn"));
  assert.ok(attempt.length > 0, "expected the timer callback");
  assert.ok(attempt.indexOf("quietWaitMs(readQuietInput())") >= 0, "the fire-time check");
  assert.ok(attempt.indexOf("quietWaitMs(readQuietInput())") < attempt.indexOf("onFire()"), "checked before it shows");
  assert.match(runtime, /dialogOpen: dialogFlag\(\)/, "the check reads the shared dialog flag");
  // And it is cancelled while a dialog opens or a text field takes focus, and restarted after.
  assert.match(runtime, /const onDialog = \(open: boolean\) => \{\s*if \(open\) clear\(\);/, "a dialog opening cancels the pending show");
  assert.match(runtime, /const onFocusIn = [\s\S]*?isTextEntry\(e\.target as HTMLElement \| null\)\) clear\(\)/, "focusing a text field cancels it");
  assert.match(runtime, /schedule\(delayMs\)/, "and it restarts when the visitor is done");
});

test("the delay is a timing change only — every frequency cap is untouched", () => {
  // Waiting longer must not quietly become "shows to more people". Each nudge
  // keeps its own eligibility and frequency rules; this pins the ones that
  // would be easiest to lose while editing the timer next to them.
  const signup = readCode("src/components/SignupPromoPopup.tsx");
  assert.match(signup, /PAGES_BETWEEN_SHOWS/, "the popup still spaces out re-shows after a dismissal");
  assert.match(signup, /if \(!loaded \|\| user/, "still signed-out only — the two audiences must not overlap");

  const annual = readCode("src/components/AnnualSwitchNudge.tsx");
  assert.match(annual, /MIN_MONTHS/, "the annual nudge still requires tenure");
  assert.match(annual, /MAX_DISMISSALS\s*=\s*2/, "two 'not now's is still a permanent no");
});

test("the history behind this number is written down where the next editor will see it", () => {
  // A bare 5s delay measurably cost the site the last time it ran (bounce up,
  // pages/visitor down, buy_click down, 78% dismissed). Whoever changes this
  // next should meet that evidence, not a naked constant.
  const src = read("src/lib/nudge-timing.ts");
  assert.match(src, /78%/, "the recorded dismiss rate from the last 5s era must stay in the file");
  assert.match(src, /buy_click/, "the metrics to watch must be named");
  assert.match(src, /intrusive interstitial/, "Google's guidance on pop-ups over a phone's first page must stay in the file");
  assert.match(src, /instant with no page-view gate/, "the flip-flop history must stay in one place");
});

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
  "src/components/SignupPromoPopup.tsx", // signed-out: sign up / Premium
  // "src/components/PremiumSlideIn.tsx" (signed-in free: Premium) was removed
  // on 2026-09-28 — upgrade prompts now live at the free limits.
  "src/components/AnnualSwitchNudge.tsx", // monthly subscriber: switch to annual
];

test("the shared delay is zero: instant once eligible (owner, 2026-09-29)", () => {
  // Five seconds from 2026-09-11; back to instant on 2026-09-29: "make the sign
  // up and premium slider instant. I want to bring the instant feature back."
  // Hours later the page-view and reading gates went too: both cards show on
  // the first page as soon as it loads (tests/first-visit-ux.test.ts).
  assert.equal(NUDGE_DELAY_MS, 0);
});

test("every corner nudge waits the shared delay before showing", () => {
  for (const f of NUDGES) {
    const code = readCode(f);
    assert.match(code, /NUDGE_DELAY_MS/, `${f} must read the shared nudge delay`);
    // Imported AND actually used as the timer — an unused import would leave the
    // old behaviour in place while looking fixed.
    // No landing-page swap any more (2026-09-29): the shared delay everywhere.
    assert.match(code, /\}, NUDGE_DELAY_MS\)/, `${f} must use it as the show timer, not merely import it`);
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
  // Five seconds is long enough to leave. Without cleanup the nudge fires
  // against a page that is gone — including one the component's own SKIP_PATHS
  // would have refused.
  for (const f of NUDGES) {
    const code = readCode(f);
    assert.match(code, /clearTimeout/, `${f} must clear its pending show on unmount/route change`);
  }
});

test("the modal yield is checked when the timer FIRES, not when it is armed", () => {
  // A modal can open during the wait. Checking only at arm time would let the
  // nudge slide in over a visitor who started writing feedback two seconds ago
  // — the exact thing the rcDialog flag exists to prevent.
  for (const f of NUDGES) {
    const code = readCode(f);
    const armAt = code.indexOf("setTimeout(");
    const guardAt = code.indexOf("dataset.rcDialog");
    assert.ok(armAt >= 0, `${f} must arm a timer`);
    assert.ok(guardAt > armAt, `${f} must check the modal flag inside the timer, not before arming it`);
  }
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
});

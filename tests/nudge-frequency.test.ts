import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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

// The header callout that replaced the corner slider on 2026-10-25.
const SLIDE = "src/components/PricingNudge.tsx";
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

// The header's Pricing callout (PricingNudge) and the monthly→annual corner
// card (AnnualSwitchNudge) went on 2026-11-03 (owner: "get rid of all the
// sliders regarding the premium and the signups. People can do it if they
// want to"). No uninvited Premium or sign-up prompt exists any more.
test("the cap has exactly one definition", () => {
  assert.equal(MAX_NUDGE_DISMISSALS, 2, "two firm no's is a no");
  assert.equal(SNOOZE_AFTER_DISMISS_MS, 7 * 864e5, "a week of quiet after a dismissal");
  assert.equal(SNOOZE_AFTER_CLICK_MS, 14 * 864e5, "a fortnight after an engaged click");
  assert.ok(SNOOZE_AFTER_CLICK_MS > SNOOZE_AFTER_DISMISS_MS, "engaging must buy MORE quiet than refusing, or the incentives are backwards");
});

test("no Premium or sign-up slider exists, and none may gate its own close control", () => {
  for (const f of [SLIDE, ANNUAL, "src/components/PremiumSlideIn.tsx", "src/components/SignupPromoPopup.tsx"]) {
    assert.ok(!existsSync(join(process.cwd(), f)), `${f} stays gone`);
  }
  // The one corner card left (the rating ask) must still close from first paint.
  const src = code("src/components/RateUsPrompt.tsx");
  assert.ok(!/(canDismiss|dismissEnabled|allowClose|unlockClose)/i.test(src), 'no "may they close it yet" state');
  assert.ok(!/aria-disabled/.test(src), "no aria-disabled");
});

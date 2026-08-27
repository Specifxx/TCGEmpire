import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
// Comments describe what the component deliberately does NOT do (e.g. "never
// sets the modal flag"), so assert against code with comments stripped.
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const SRC = "src/components/PremiumSlideIn.tsx";

// ─────────────────────────────────────────────────────────────────────────────
// The Premium slide-in is a paid-conversion nudge, so its guarantees are the kind
// that fail silently and cost either money (never shown) or trust (shown to the
// wrong people / too often). Pin them.
// ─────────────────────────────────────────────────────────────────────────────

test("it only ever targets a logged-in, non-Premium user who can actually buy", () => {
  const code = codeOnly(read(SRC));
  // `!premium` is load-bearing: `premium` from useMe() is true for anyone with
  // access RIGHT NOW — paid OR mid-trial/preview — so this single check also keeps
  // the nudge away from trial/preview users, who should never be pushed to buy.
  assert.match(code, /!premium/, "must not show to anyone who currently has Premium (paid or trialing)");
  assert.match(code, /!!user/, "must require a signed-in user");
  assert.match(code, /premiumCheckout/, "must require that Premium can be purchased");
});

test("it is NON-MODAL: it yields to real modals and never blocks them", () => {
  const code = codeOnly(read(SRC));
  // Reads the shared dialog flag so it won't slide in over an open modal…
  assert.match(code, /dataset\.rcDialog === "1"/, "must not appear on top of an open modal");
  // …but must NEVER set it, or it would block the feedback/signup modals the way
  // a modal does. A corner toast has no business claiming the modal lock.
  assert.doesNotMatch(code, /dataset\.rcDialog\s*=\s*["']1["']/, "a non-modal toast must not claim the modal flag");
  // No scroll lock — that is a modal behaviour.
  assert.doesNotMatch(code, /body\.style\.overflow\s*=\s*["']hidden["']/, "must not lock page scroll");
});

test("frequency is capped hard across sessions, not just per session", () => {
  const code = codeOnly(read(SRC));
  assert.match(code, /MAX_DISMISSALS\s*=\s*2/, "two dismissals must be a permanent no");
  assert.match(code, /localStorage/, "the lifetime dismissal count / snooze must survive the session");
  assert.match(code, /sessionStorage/, "must also cap to once per browser session");
  // A snooze window after both a dismiss and an engaged click.
  assert.match(code, /SNOOZE_AFTER_DISMISS_MS/, "a dismiss must snooze it");
  assert.match(code, /SNOOZE_AFTER_CLICK_MS/, "engaging the CTA must snooze it (not burn a permanent strike)");
});

test("the CTA opens the shared Premium dialog (so the existing click beacon fires)", () => {
  const code = codeOnly(read(SRC));
  assert.match(code, /usePremiumDialog/, "must reuse the site-wide Premium dialog, not a bespoke checkout");
  assert.match(code, /openPremium\(\)/, "clicking through must open that dialog");
});

test("it emits a shown / click / dismissed event trio, routed to the right destinations", () => {
  const code = read(SRC);
  for (const ev of ["premium_slidein_shown", "premium_slidein_click", "premium_slidein_dismissed"]) {
    assert.ok(code.includes(ev), `must fire ${ev}`);
  }
  // The two high-volume impression events go to GA4 only (Vercel bills custom
  // events); the low-volume click stays dual so it lands next to buy_click.
  const analytics = read("src/lib/analytics.ts");
  const ga4Only = analytics.slice(analytics.indexOf("GA4_ONLY_EVENTS"), analytics.indexOf("export function trackEvent"));
  assert.ok(ga4Only.includes("premium_slidein_shown"), "shown is an impression → GA4-only");
  assert.ok(ga4Only.includes("premium_slidein_dismissed"), "dismissed tracks the impression → GA4-only");
  assert.ok(!ga4Only.includes("premium_slidein_click"), "click is the conversion leg and must reach Vercel too");
});

test("it is mounted inside the Premium dialog provider", () => {
  const layout = read("src/app/layout.tsx");
  assert.match(layout, /<PremiumSlideIn\s*\/>/, "must be rendered in the layout");
  // usePremiumDialog() only has context inside PremiumDialogProvider.
  const providerAt = layout.indexOf("<PremiumDialogProvider>");
  const slideInAt = layout.indexOf("<PremiumSlideIn");
  const providerCloseAt = layout.indexOf("</PremiumDialogProvider>");
  assert.ok(providerAt >= 0 && slideInAt > providerAt && slideInAt < providerCloseAt, "must sit inside <PremiumDialogProvider>");
});

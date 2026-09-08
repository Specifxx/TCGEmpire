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

test("the CTA navigates straight to /premium, and still fires the click beacon itself (2026-09-06)", () => {
  const code = codeOnly(read(SRC));
  assert.ok(!/usePremiumDialog/.test(code), "must no longer open the site-wide Premium dialog");
  assert.match(code, /router\.push\(["']\/premium["']\)/, "clicking through must navigate straight to /premium");
  assert.match(code, /firePremiumClickBeacon/, "must fire the same premium-interest beacon the dialog used to fire on open");
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

test("the pitch chips name real Premium-only tools, and none are missing", async () => {
  // Guards exactly the bug this redesign fixed: a hand-written sentence naming
  // three tools drifted out of date the moment Best Basket moved back to
  // Premium and Demand Finder shipped, and nothing caught it. PITCH_TOOLS is
  // still a hand-maintained list (TierComparisonTable's TIER_COMPARISON isn't
  // imported here to keep this component free of a data-layer dependency), so
  // this test is the thing that must catch the next drift instead.
  const src = read(SRC);
  const listMatch = src.match(/const PITCH_TOOLS[^=]*=\s*\[([\s\S]*?)\n\];/);
  assert.ok(listMatch, "expected a PITCH_TOOLS array declaration");
  const labels = [...listMatch![1].matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);
  assert.ok(labels.length >= 4, "expected a real, non-trivial pitch — not just one or two tools");

  const { TIER_COMPARISON } = (await import("../src/components/TierComparisonTable")) as {
    TIER_COMPARISON: { feature: string; account: boolean | string; premium: boolean | string }[];
  };
  // Every row where Premium genuinely gives MORE than a free account — a flat
  // premium-only tool (Bulk Pricer, Best Basket, Value Finder, Demand Finder)
  // or a "Top pick vs Full list" upgrade (Deal Finder, Rising Cards). "Ad-free
  // experience" is excluded on purpose: it's a site-wide perk, not a tool with
  // its own page, and the component already names it in prose ("goes
  // ad-free") rather than as a chip.
  const premiumOnly = TIER_COMPARISON.filter(
    (r) => r.account !== r.premium && r.feature !== "Ad-free experience"
  ).map((r) => r.feature.replace(/\s*—.*$/, "").trim());
  for (const feature of premiumOnly) {
    assert.ok(
      labels.some((l) => feature.includes(l) || l.includes(feature)),
      `TIER_COMPARISON has a Premium-only row "${feature}" that PITCH_TOOLS doesn't mention`
    );
  }
  for (const label of labels) {
    assert.ok(
      premiumOnly.some((f) => f.includes(label) || label.includes(f)),
      `PITCH_TOOLS names "${label}", which isn't a Premium-only TIER_COMPARISON row — likely a stale or misspelled entry`
    );
  }
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

import test from "node:test";
import assert from "node:assert/strict";
import { MAX_NUDGE_DISMISSALS } from "../src/lib/nudge-timing";
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
  // Reads the shared dialog flag so it won't slide in over an open modal: since
  // 2026-09-29 through the shared show timer (lib/nudge-runtime.ts armNudge),
  // which checks it when the timer FIRES and cancels while a dialog is open…
  assert.match(code, /return armNudge\(\{/, "must arm the shared timer, which yields to an open modal");
  assert.match(codeOnly(read("src/lib/nudge-runtime.ts")), /dataset\.rcDialog === "1"/, "must not appear on top of an open modal");
  assert.match(code, /dataset\.rcDialog !== "1"\) dismiss\(\)/, "Escape belongs to an open dialog, not this card");
  // …but must NEVER set it, or it would block the feedback/signup modals the way
  // a modal does. A corner toast has no business claiming the modal lock.
  assert.doesNotMatch(code, /dataset\.rcDialog\s*=\s*["']1["']/, "a non-modal toast must not claim the modal flag");
  // No scroll lock — that is a modal behaviour.
  assert.doesNotMatch(code, /body\.style\.overflow\s*=\s*["']hidden["']/, "must not lock page scroll");
});

test("frequency: once a session, a dismissal snoozes it for days, a click for a fortnight", () => {
  const code = codeOnly(read(SRC));
  // The Akali slider (2026-10-17): no permanent two-strike cap any more (owner:
  // "it should just be there"), but still never twice in a session.
  assert.match(code, /sessionStorage/, "must cap to once per browser session");
  assert.match(code, /localStorage/, "the snooze must survive the session");
  assert.match(code, /PREMIUM_SLIDER_SNOOZE_MS/, "a dismiss snoozes it");
  assert.match(code, /SNOOZE_AFTER_CLICK_MS/, "engaging the CTA snoozes it");
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

test("the pitch chips name every differentiating tier row, and none are missing", async () => {
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
    TIER_COMPARISON: { feature: string; account: boolean | string; plus: boolean | string; premium: boolean | string }[];
  };
  // Every DIFFERENTIATING row — one where a paid tier gives more than a free
  // account. Since the 2026-09-25 lineup that is the two full lists (Deal
  // Finder, Rising Cards), target-price alerts, Best Basket's store-by-store
  // plan and Buy this list — and Demand Finder, Premium again later that day;
  // the Bulk Pricer and Value Finder chips went with those tools. "Ad-free experience" is excluded on purpose:
  // it's a site-wide perk, not a tool with its own page, and the component
  // names it in prose ("Plus and Premium are ad-free") rather than as a chip.
  const premiumOnly = TIER_COMPARISON.filter(
    (r) => (r.account !== r.premium || r.account !== r.plus) && r.feature !== "Ad-free experience"
  ).map((r) => r.feature.replace(/\s*—.*$/, "").trim());
  assert.deepEqual(
    premiumOnly,
    ["Watchlist & new-low alerts", "Portfolio", "Set tracker", "Deal Finder", "Rising Cards", "Target-price alerts after every price update", "Best Basket", "Buy this list", "Finish this set", "Minimum condition", "Demand Finder", "Sealed watches", "Deck price watch", "Full price history", "Graded price tracking", "Auction alerts", "Riftcoins"],
    "fixture check: the differentiating rows of the 2026-09-25 lineup, plus the 2026-09-28 free limits and the 2026-09-29 watches, minimum condition and set tracker",
  );
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

// ─────────────────────────────────────────────────────────────────────────────
// Contextual pitch (2026-09-08 pricing/conversion pass) — a route-specific
// heading/line instead of one flat "unlock N tools" pitch everywhere.
// ─────────────────────────────────────────────────────────────────────────────

test("every CONTEXT_PITCH names a real PITCH_TOOLS tool, so it can't drift the way the old hand-written sentence did", () => {
  const src = read(SRC);
  const listMatch = src.match(/const PITCH_TOOLS[^=]*=\s*\[([\s\S]*?)\n\];/);
  assert.ok(listMatch, "expected PITCH_TOOLS");
  const labels = [...listMatch![1].matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);

  const ctxMatch = src.match(/const CONTEXT_PITCH:[^=]*=\s*\[([\s\S]*?)\n\];/);
  assert.ok(ctxMatch, "expected a CONTEXT_PITCH array declaration");
  const tools = [...ctxMatch![1].matchAll(/tool: "([^"]+)"/g)].map((m) => m[1]);
  assert.ok(tools.length >= 1, "expected at least one contextual pitch entry");
  for (const tool of tools) {
    assert.ok(labels.includes(tool), `CONTEXT_PITCH names "${tool}", which isn't a PITCH_TOOLS label`);
  }

  // The heading text itself must actually mention the tool it claims to be
  // about — the whole point of a contextual pitch is that the visible copy
  // names the real thing being sold, not just an internal tag.
  const headings = [...ctxMatch![1].matchAll(/heading: "([^"]+)"/g)].map((m) => m[1]);
  assert.equal(headings.length, tools.length, "every CONTEXT_PITCH entry must have both a tool and a heading");
  for (let i = 0; i < tools.length; i++) {
    assert.ok(headings[i].includes(tools[i]), `heading "${headings[i]}" doesn't mention its own tool "${tools[i]}"`);
  }
});

test("the slider makes no proof request: the comparison table is the pitch", () => {
  const code = codeOnly(read(SRC));
  assert.doesNotMatch(code, /api\/premium\/proof/);
});

test("the Akali slider: the owner's art, the Free vs Premium table, and the ask always in view", () => {
  const code = codeOnly(read(SRC));
  assert.match(code, /const ART = "\/premium\/premium-pitch\.webp";/, "the Akali art is back");
  assert.match(code, /<img src=\{ART\} alt="" aria-hidden="true"/, "decorative, with the alt attribute the build guard requires");
  assert.match(code, /<TierComparisonTable compact/, "the real comparison table, not a hand-written list");
  // Header and buttons never scroll; only the table does.
  assert.match(code, /flex max-h-\[min\(82dvh,calc\(100dvh-9\.5rem\)\)\] flex-col/);
  assert.match(code, /min-h-\[6\.5rem\] flex-1 overflow-y-auto/, "the table is the only scrolling part, never squeezed away");
  assert.ok(code.indexOf("<TierComparisonTable") < code.indexOf("<AuthForm"), "table, then the sign-in buttons");
});

test("a corner card that fits a phone: 22rem at most, inset 1rem, clear of the tab bar", () => {
  const code = codeOnly(read(SRC));
  assert.match(code, /w-\[calc\(100%-2rem\)\] max-w-\[22rem\]/, "never edge to edge on a phone");
  assert.match(code, /sm:w-\[22rem\]/, "a fixed card on a desktop");
  assert.match(code, /above-bottombar fixed left-4/, "a bottom-left card that clears the tab bar");
});

test("its ✕ is at least 44px, labelled, never scrolls away, and Escape closes it", () => {
  const code = codeOnly(read(SRC));
  const btn = code.slice(code.indexOf("onClick={dismiss}"), code.indexOf("✕"));
  assert.match(btn, /aria-label="Dismiss"/);
  assert.match(btn, /min-h-11 min-w-11/, "44px at every width");
  assert.match(code, /relative shrink-0 overflow-hidden/, "the ✕ sits in the header, which never scrolls");
  assert.match(code, /e\.key === "Escape"/, "Escape closes it");
  assert.doesNotMatch(code, /disabled=\{/, "no disabled control on the card");
});

test("respects prefers-reduced-motion: the slide only exists under motion-safe", () => {
  const code = codeOnly(read(SRC));
  assert.match(code, /motion-safe:translate-y-4 motion-safe:opacity-0/, "the un-entered state is motion-safe only, so reduced motion just appears");
  assert.doesNotMatch(code, /(?<!motion-safe:)translate-y-4 /, "no unconditional slide");
});

test("the price stays one honest line: the $1 first month when a trial exists (then the plan price), otherwise the real price", () => {
  const code = codeOnly(read(SRC));
  // 2026-09-30: "First 30 days for $1 · then from $2.99/mo", from the shared helper
  // and the configured fee; the button reads "Start 30 days for $1".
  assert.match(code, /trialOfferLead\(trialDays, trialFeeCents\)/);
  assert.match(code, /then from \{premiumPlus \? tierMonthlyAmount\("plus"\) : PREMIUM_PRICE_AMOUNT\}\/mo/, "the plan price it turns into is beside the $1");
  assert.match(code, /trialButtonLabel\(trialDays, trialFeeCents\)/);
  assert.match(code, /introFromLine\("premium", introEligible\)/);
  assert.match(code, /premiumLockInTail\(\)/);
  assert.match(code, /premiumPriceIncreaseAnnounced\(\)/, "an announced increase is still stated, on the card");
});

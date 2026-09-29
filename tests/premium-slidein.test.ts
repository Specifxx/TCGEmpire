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

test("frequency is capped hard across sessions, not just per session", () => {
  const code = codeOnly(read(SRC));
  // The VALUE moved to lib/nudge-timing.ts on 2026-09-14 so SignupPromoPopup
  // could adopt the same cap from one definition instead of a second copy of
  // the number. Assert it there, and that this file actually consumes it —
  // pinning the literal here would have blocked the de-duplication.
  assert.equal(MAX_NUDGE_DISMISSALS, 2, "two dismissals must be a permanent no");
  assert.match(code, /MAX_DISMISSALS = MAX_NUDGE_DISMISSALS/, "the slide-in must use the shared cap, not its own copy");
  assert.match(code, />= MAX_DISMISSALS\) return/, "and must actually enforce it");
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
    ["Watchlist & new-low alerts", "Portfolio", "Set tracker", "Deal Finder", "Rising Cards", "Target-price alerts after every price update", "Best Basket", "Buy this list", "Finish this set", "Minimum condition", "Demand Finder", "Sealed watches", "Deck price watch"],
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

test("the live proof line is fetched only after the card appears AND its disclosure is opened, never on mount", () => {
  const code = codeOnly(read(SRC));
  // The proof-fetch effect must be gated on `shown` (its own dependency array
  // includes it) — a fetch that could fire unconditionally on mount would run
  // for every eligible visitor whether or not the slide-in ever appears.
  const effectAt = code.indexOf("api/premium/proof");
  assert.ok(effectAt >= 0, "expected a fetch to api/premium/proof");
  const before = code.slice(Math.max(0, effectAt - 400), effectAt);
  // Since 2026-09-29 the proof line lives inside "See what's included", so the
  // request waits for that tap too: most visitors never open it.
  assert.match(before, /if \(!shown \|\| !details \|\| proofFetched\.current\) return;/, "the proof fetch must bail out until `shown` is true and the disclosure is open");
});

// ─────────────────────────────────────────────────────────────────────────────
// COMPACT (2026-09-29, "Nudges: value first"). At 390x844 it was ~740px tall and
// scrolled inside itself; it is now a headline, one price line, the button pair
// and a "See what's included" disclosure that opens the tier table on demand.
// The rendered heights were measured in a real browser (DECISIONS.md, the
// entry's Measured section); these pin the structure that produces them.
// ─────────────────────────────────────────────────────────────────────────────

test("compact: the tier table and the long copy are behind a 'See what's included' disclosure", () => {
  const src = read(SRC);
  const code = codeOnly(src);
  assert.match(code, /See what&apos;s included/, "the disclosure button");
  assert.match(code, /aria-expanded=\{details\}/, "announced as expandable");
  assert.match(code, /aria-controls="premium-slidein-details"/);
  assert.match(code, /const \[details, setDetails\] = useState\(false\);/, "closed by default");
  // The table is INSIDE the disclosure, after its opening condition…
  const openAt = code.indexOf("{details && (");
  assert.ok(openAt > 0, "the disclosure body is conditional");
  const tableAt = code.indexOf("<PremiumPitchPanel tableOnly");
  assert.ok(tableAt > openAt, "the tier table renders only when opened");
  // …and so are the per-page pitch line and the proof line.
  assert.ok(code.indexOf("{bodyLine}") > openAt, "the long per-page line waits behind the disclosure");
  // The default card has no full pitch panel, table or chip row.
  assert.doesNotMatch(code.slice(0, openAt), /<PremiumPitchPanel|TierComparisonTable|PITCH_TOOLS\.map/, "nothing tall above the disclosure");
});

test("compact: a small corner card, never a full-width overlay or tall panel", () => {
  const code = codeOnly(read(SRC));
  assert.match(code, /max-w-\[20rem\]/, "at most 20rem wide on a phone");
  assert.match(code, /sm:w-80/, "a fixed small card on a desktop");
  assert.doesNotMatch(code, /max-w-sm/, "not the old 24rem panel");
  assert.match(code, /details \? "max-w-\[23rem\] sm:w-\[23rem\]" : "max-w-\[20rem\] sm:w-80"/, "widens to 23rem only while the tier table is open, so its Premium column is not clipped");
  assert.match(code, /above-bottombar fixed left-4/, "a bottom-left card that clears the tab bar");
  assert.match(code, /max-h-\[min\(80dvh,calc\(100dvh-9\.5rem\)\)\]/, "a rail for the OPEN disclosure and for short viewports");
});

test("its ✕ is at least 44px, labelled, sticky, and Escape closes it", () => {
  const code = codeOnly(read(SRC));
  const btn = code.slice(code.indexOf("onClick={dismiss}"), code.indexOf("✕"));
  assert.match(btn, /aria-label="Dismiss"/);
  assert.match(btn, /min-h-11 min-w-11/, "44px at every width");
  assert.match(code, /sticky top-0/, "the ✕ never scrolls away");
  assert.match(code, /e\.key === "Escape"/, "Escape closes it");
  // Every dismiss control is a button with a real handler, none of it timed.
  assert.doesNotMatch(code, /disabled=\{/, "no disabled control on the card");
});

test("respects prefers-reduced-motion: the slide only exists under motion-safe", () => {
  const code = codeOnly(read(SRC));
  assert.match(code, /motion-safe:translate-y-4 motion-safe:opacity-0/, "the un-entered state is motion-safe only, so reduced motion just appears");
  assert.doesNotMatch(code, /(?<!motion-safe:)translate-y-4 /, "no unconditional slide");
});

test("the price stays one honest line: $0 today when a trial exists, otherwise the real price", () => {
  const code = codeOnly(read(SRC));
  assert.match(code, /premiumZeroToday\(\)/);
  assert.match(code, /introFromLine\("premium", introEligible\)/);
  assert.match(code, /premiumLockInTail\(\)/);
  assert.match(code, /premiumPriceIncreaseAnnounced\(\)/, "an announced increase is still stated, on the card");
});

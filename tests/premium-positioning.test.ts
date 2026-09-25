import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { PREMIUM_COPY_VERSION } from "../src/lib/site";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
// Comment-stripped: several of these files deliberately RECORD the retired
// wording in their header comments so the next reader knows what changed and
// why. Those comments are the point; they must not read as the copy itself.
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

// ─────────────────────────────────────────────────────────────────────────────
// WHAT PREMIUM IS ALLOWED TO PROMISE (2026-09-14). See DECISIONS.md.
//
// The pitch used to be "Get an unfair edge buying and selling", under "Buy
// smarter. Sell higher.", surrounded by flipper/resale/pre-emption language. The
// owner's objection: that sells an advantage over other players, and the site
// was doing too much to promote scalping. It also contradicted /about's own
// stated mission — "so players can spend less time hunting and more time
// playing" — and duplicated the job of the sister site built for treating cards
// as an asset.
//
// The rule these tests enforce: EVERY PREMIUM MARKETING LINE DESCRIBES EITHER A
// SAVING THE READER MAKES OR A FACT ABOUT WHAT A TOOL COMPUTES. Never a gain
// made at someone else's expense.
//
// This is deliberately NOT a ban on the underlying tools. Rising Cards is a
// demand-and-stock screen — since 2026-09-25 its own FAQ says "not a
// prediction" — and it keeps describing itself accurately on its own page,
// disclaimers and all. Re-describing it as a savings tool would be the
// invented claim this repo fails builds over; so would selling it as a
// buy-now-or-wait answer (tested below). What is banned is the advantage
// FRAMING wrapped around it in the pitch.
// ─────────────────────────────────────────────────────────────────────────────

// Every surface that sells Premium to someone who hasn't bought it.
const PITCH_SURFACES = [
  "src/app/premium/page.tsx",
  "src/components/PremiumDialog.tsx",
  "src/components/PremiumSlideIn.tsx",
  "src/components/SignupPromoPopup.tsx",
  "src/components/PremiumPitchPanel.tsx",
  "src/components/PremiumCta.tsx",
  "src/components/PremiumPricingCards.tsx",
  "src/components/MoversToolsCta.tsx",
  "src/app/tools/page.tsx",
  "src/app/dashboard/page.tsx",
  "src/app/tools/deal-finder/page.tsx",
  "src/app/tools/rising/page.tsx",
];

// lib/email.ts is NOT scanned whole: it holds every transactional email on the
// site, and two legitimate lines would trip the rules below — a password-reset
// link that genuinely "expires in 1 hour", and sealed-email copy whose at-RRP
// flag exists precisely so a buyer can tell "a fair price or a scalp" apart.
// Banning the word there would delete anti-scalping copy in the name of an
// anti-scalping rule. So only the Premium-pitch region is checked: from the
// checkout-recovery tool list through the end of the offer email.
function premiumEmailCopy(): string {
  const src = code("src/lib/email.ts");
  const from = src.indexOf("CHECKOUT_RECOVERY_TOOLS = [");
  const to = src.indexOf("export async function sendPremiumOfferEmail");
  assert.ok(from >= 0 && to > from, "the Premium email region moved — re-derive these bounds");
  return src.slice(from, to);
}

const RETIRED = [
  { re: /unfair edge/i, why: "sells an advantage over other buyers, not a saving" },
  { re: /buy smarter\.\s*sell higher/i, why: "the sell-side half of the retired eyebrow" },
  { re: /flipper|flipping\s+(cards|to)|every flip\b/i, why: "names resale-for-profit as the audience" },
  { re: /\bscalp/i, why: "never the pitch, in any direction" },
  { re: /before (they|it) bounce|before anyone else|ahead of the market/i, why: "pre-emption framing — buying to get in front of other buyers" },
];

test("no Premium pitch surface sells an advantage over other buyers", () => {
  for (const [label, src] of [
    ...PITCH_SURFACES.map((f) => [f, code(f)] as const),
    ["src/lib/email.ts (Premium region)", premiumEmailCopy()] as const,
  ]) {
    for (const { re, why } of RETIRED) {
      assert.ok(!re.test(src), `${label} carries retired positioning (${re}): ${why}`);
    }
  }
});

test("the tagline is present on all four surfaces that carry the headline, and the panel matches it", () => {
  for (const file of [
    "src/app/premium/page.tsx",
    "src/components/PremiumDialog.tsx",
    "src/components/PremiumSlideIn.tsx",
    // SignupPromoPopup is deliberately NOT here since 2026-09-16: it sells the
    // free account and names no price, so it carries no Premium headline, no
    // tagline and no lock-in copy to keep in sync. Premium lives on the three
    // surfaces below plus PremiumSlideIn for signed-in visitors.
  ]) {
    assert.match(code(file), /Never overpay for a Riftbound card/, `${file} must carry the tagline`);
  }
  // The graphic panel splits the same line across three rows, so it can't match
  // the sentence — check its parts and its eyebrow instead.
  const panel = code("src/components/PremiumPitchPanel.tsx");
  assert.match(panel, /Never/);
  assert.match(panel, />Overpay</);
  assert.match(panel, /for a Riftbound card/);
  assert.match(panel, /Spend less on every order\./, "the eyebrow must lead on the saving too");
});

test("the site states who it is for, and the editorial policy backs it", () => {
  const about = read("src/app/about/page.tsx");
  assert.match(about, /id="who-its-for"/, "/about must carry the stated position, with a linkable id");
  assert.match(about, /buy the cards\s*\n?\s*they want without overpaying/, "the position must name buying well as the purpose");
  assert.match(about, /profit\s*\n?\s*at another player&rsquo;s expense/, "it must say plainly what the site is NOT marketed as");
  assert.match(about, /riftboundstocks\.com/i, "the asset-tracking use case has its own site — point there rather than serving it here");

  const policy = read("src/app/editorial-policy/page.tsx");
  assert.match(policy, /profit at another buyer&rsquo;s expense/, "the policy page must carry the same commitment");
  assert.match(policy, /about#who-its-for/, "and link to the position it restates");
});

test("the honest tools keep their disclaimers — the reframe must not have quietly upgraded a signal into a promise", () => {
  // The reframe rewrote how these are PITCHED. What each one measures, and how
  // uncertain it is, must still be stated where it is actually used.
  // Rising Sealed, the Value Finder and the Demand Finder (whose hub intro
  // carried "deliberately not a price prediction") were pinned here until they
  // left the product on 2026-09-25.
  for (const [file, needle] of [
    ["src/app/tools/rising/page.tsx", /not financial advice/i],
  ] as const) {
    assert.match(read(file), needle, `${file} must keep its honest-limits disclosure`);
  }
  // And the two Premium surfaces that name a prediction tool must not promise a
  // price outcome from it.
  for (const file of ["src/app/premium/page.tsx", "src/components/PremiumSlideIn.tsx"]) {
    assert.ok(
      !/will (go up|rise|increase)/i.test(code(file)),
      `${file} must not promise that a price will move`,
    );
  }
});

test("the funnel events carry a copy version that post-dates the reframe", () => {
  // Its own header in site.ts requires a bump whenever the price or framing
  // changes, so GA4 can split before/after. Without this the reframe is
  // unmeasurable — every event before and after lands in one bucket.
  // Pinned by SHAPE, not by campaign name — this constant is expected to change
  // every time the price or framing does (its own header in site.ts says so),
  // and pinning one value here just means the next legitimate bump fails CI.
  // What must hold: it is not a pre-reframe value, and it is dated, so GA4 can
  // order the eras it labels.
  for (const stale of ["tiers-2026-09-11", "edge-graphic-2026-09-10", "zero-today-2026-09-09", "lineup-2026-09-25"]) {
    assert.notEqual(PREMIUM_COPY_VERSION, stale, "bump the copy version with the framing change");
  }
  // An optional letter orders two framings on one day ("lineup-2026-09-25b").
  assert.match(PREMIUM_COPY_VERSION, /-20\d{2}-\d{2}-\d{2}[a-z]?$/, "the tag should end in the date of the framing it labels");
});

test("the reframe did not smuggle in scarcity or invented numbers", () => {
  // The guards the previous passes established, re-applied to every file this
  // one touched — a rewrite is exactly when they get lost.
  for (const [label, src] of [
    ...PITCH_SURFACES.map((f) => [f, code(f)] as const),
    ["src/lib/email.ts (Premium region)", premiumEmailCopy()] as const,
  ]) {
    assert.ok(!/only \d+ (left|spots|seats)/i.test(src), `${label} must not invent scarcity`);
    assert.ok(!/expires? in/i.test(src), `${label} must not invent a countdown`);
  }
});

test("Rising Cards is never sold as a buy-now-or-wait answer, and no copy promises a signal breakdown it doesn't show", () => {
  // Review, 2026-09-25: the tool's own FAQ says "a screen … not a prediction",
  // and until its price signals rebuild after the 2026-09-23 re-basing every
  // pick is ranked on demand and stock alone — while five pitch surfaces sold
  // it as "whether to buy one now or wait". The per-signal breakdown those
  // lines promised was removed from the page in the same change.
  for (const f of [...PITCH_SURFACES, "src/app/llms.txt/route.ts", "src/lib/dashboard-tools.ts", "src/components/TodaysTopDeals.tsx"]) {
    assert.doesNotMatch(code(f), /buy (it|one) now|bought now|or leave it|most likely to rise/i, `${f} sells Rising Cards as a timing answer`);
  }
  const walk = (d: string): string[] =>
    readdirSync(join(ROOT, d)).flatMap((n) => {
      const p = `${d}/${n}`;
      return statSync(join(ROOT, p)).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
    });
  // The admin page genuinely shows each pick's per-signal breakdown.
  for (const f of walk("src").filter((f) => !f.startsWith("src/app/admin/"))) {
    assert.doesNotMatch(code(f), /signal breakdown|signals behind each score/i, `${f} promises a breakdown the page no longer shows`);
  }
});

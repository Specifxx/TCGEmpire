import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// The 2026-09-10 "make it visual" pass. Owner brief, four parts:
//   1. both corner nudges' text pitch → the owner's designed PremiumPitchPanel
//   2. a gold, shimmering "✦ Premium" next to Database in the PHONE header
//   3. the tagline → "Get an unfair edge buying and selling"
//   4. /premium's CTA → one big green button, price demoted to the small print
// See DECISIONS.md for the two conventions this knowingly reverses (the
// retired shimmer, and gold-for-Premium on the /premium CTA specifically).
// ─────────────────────────────────────────────────────────────────────────────

const PANEL = "src/components/PremiumPitchPanel.tsx";

test("the panel is presentational only — no hooks, no client boundary, no data fetch", () => {
  const src = read(PANEL);
  assert.ok(!/^"use client";/m.test(src), "must not be a client component — it renders from the server /premium tree too");
  assert.ok(!/\buseState\b|\buseEffect\b|\buseMe\b|\buseCountry\b/.test(src), "must not use any hook");
  assert.ok(!/fetch\(/.test(src), "must not fetch — it is a static illustration, not a live figure");
});

// ─────────────────────────────────────────────────────────────────────────────
// REDESIGNED 2026-09-15 (see DECISIONS.md): the character-art background and
// the four hand-written feature rows were both replaced — explicit product
// feedback that the art "doesn't really mean anything" and a request for "a
// very quick comparison, ticks and X's" instead of persuasive sentences. The
// two tests below replace the ones that pinned the retired design; the
// no-fake-scarcity / no-invented-figures guarantees they also carried now
// live structurally, since the feature claims are TIER_COMPARISON's own rows
// (checked by tests/access-tiers.test.ts and tests/ad-free-tier.test.ts)
// rather than hand-typed copy in this file at all.
// ─────────────────────────────────────────────────────────────────────────────

test("the feature block is the real, shared tick/✗ comparison table, not a hand-typed list", () => {
  const src = read(PANEL);
  assert.match(src, /import \{ TierComparisonTable \} from "\.\/TierComparisonTable"/, "must import the shared table rather than declaring its own rows");
  assert.match(src, /<TierComparisonTable compact showPlus=\{showPlus\}/, "must render it compact, with showPlus threaded through as a prop");
  assert.ok(!/const FEATURES/.test(src), "the retired hand-typed FEATURES array must be gone");
});

test("no character art — the panel uses the site's own brand mark instead", () => {
  const src = read(PANEL);
  assert.ok(!/<img\b/.test(src), "the panel must render no <img> at all — the character-art background is retired");
  assert.ok(!/premium-pitch\.webp/.test(src), "must not reference the retired artwork file");
  assert.match(src, /import \{ BrandLogo \} from "\.\/BrandLogo"/, "must use the shared brand mark, not a one-off asset");
  // Used twice: a small identifying icon next to the wordmark, and a large
  // decorative watermark in the corner the art used to occupy.
  assert.equal((src.match(/<BrandLogo /g) ?? []).length, 2, "expected exactly two BrandLogo uses (wordmark icon + watermark)");
});

test("the Premium corner nudge renders the graphic, and the free-account one renders nothing Premium", () => {
  // WAS "both corner nudges" until 2026-09-16, when SignupPromoPopup stopped
  // pitching Premium at all (owner's reversal — see that component's header).
  // PremiumSlideIn is now the only corner nudge carrying the panel, and the
  // assertion that matters for the popup is the opposite one: it must not
  // carry it, or the paid pitch is back on the signed-out surface by accident.
  const slideIn = read("src/components/PremiumSlideIn.tsx");
  assert.match(slideIn, /<PremiumPitchPanel/, "PremiumSlideIn must render the shared designed panel");
  assert.ok(!/PITCH_TOOLS\.map\(/.test(slideIn), "must no longer render the tool chip row the graphic replaced");

  const popup = read("src/components/SignupPromoPopup.tsx");
  assert.ok(!/<PremiumPitchPanel/.test(popup), "the signed-out popup must not render the Premium panel");
  assert.ok(!/PITCH_TOOLS/.test(popup), "nor name Premium-only tools");
  assert.match(popup, /<FreeAccountCompare \/>/, "it renders the free-account comparison instead");
});

test("PITCH_TOOLS survives as the canonical Premium-only tool list even though nothing renders it", () => {
  // It is still what tests/premium-slidein.test.ts pins against
  // TIER_COMPARISON, and what every CONTEXT_PITCH entry is validated against.
  // Deleting it with the chip row would have quietly removed the guard that
  // catches the next tier change.
  const src = read("src/components/PremiumSlideIn.tsx");
  assert.match(src, /export const PITCH_TOOLS/, "the shared list must stay exported");
  assert.match(src, /CONTEXT_PITCH/, "the contextual per-route pitch must stay — it is more specific than any graphic");
});

test("the phone header still carries a gold Premium link, without disturbing the desktop one", () => {
  const src = read("src/components/Navbar.tsx");
  // THIS TEST ONCE ANCHORED ON THE MOBILE "Database" LINK, which was briefly
  // removed on 2026-09-18 and restored on 2026-09-19. The history: when the bottom
  // tab bar was deleted, its Menu tab moved into this row as HeaderMenuButton
  // and cost 46px in a row with one pixel of slack at 375px. Database was the
  // most redundant ~76px available — the full-width search box on the next row
  // submits to /browse — so it went, and the page stopped scrolling sideways on
  // every phone (tests/mobile-header-fit.test.ts carries the measurements).
  //
  // PREMIUM DID NOT GO WITH IT, and that is what this test is really for: it is
  // there by an explicit 2026-09-10 brief, and it is the reason the left cluster
  // now has to be shrinkable rather than fixed-width.
  // Comment-stripped: the tombstone explaining the history names "Database", and
  // a source-text search would match the explanation rather than a rendered link.
  const code = src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  // Sliced to the opening <nav>, not to <HeaderSearchSlot> — the header's
  // inline desktop search box was removed on 2026-09-21 (the full-height rail
  // carries Search from lg up, which is the only range that box ever rendered
  // in). The left cluster it bounded is otherwise unchanged.
  const leftCluster = code.slice(code.indexOf("h-16 w-full items-center"), code.indexOf("<nav "));
  assert.match(leftCluster, /<PremiumNavLink/, "Premium must still be in the header's left cluster on phones");
  assert.match(leftCluster, /lg:hidden/, "the mobile Premium link must stay in the below-lg band");
  assert.match(leftCluster, /text-gold/, "it must be gold — the Premium identity colour");
  // Database is back in this cluster as of 2026-09-19 ("that's the most important
  // one"), sitting immediately before Premium — the 2026-09-10 pairing restored.
  // Matched on the LABEL, which was "Browse" between 2026-09-19 and 2026-09-21
  // and is "Database" either side of that; what this test actually cares about
  // is that the card-database link and Premium stay paired in this cluster.
  assert.match(leftCluster, /Database/, "the card-database link sits beside Premium again");

  // The header's horizontal budget: nav links may not turn on before lg, and
  // the desktop Premium link must still defer to xl. Both are also pinned by
  // tests/signup-funnel.test.ts; repeated here because this change is what
  // would most plausibly break them.
  assert.ok(!/md:block md:px-2\.5/.test(src), "nav links must not turn on at md");
  // The desktop "✦ Premium" link is BACK in this row (2026-09-21, after a few
  // hours out: "I still want ... premium ... on the header"), and at lg
  // rather than the xl it used to defer to — the row lost the brand, the
  // search box, the ⌘K button and three nav links to the rail, so the slack
  // that forced xl is no longer scarce.
  assert.match(src, /<PremiumNavLink className="[^"]*\blg:block\b/, "the desktop Premium link is in the header");
  // AND the rail carries its own, at the foot, which the owner asked for
  // separately ("have premium on the sidebar as well ... like get premium").
  // Two surfaces on purpose, unlike the session control, which is header-only.
  const rail = read("src/components/SideNav.tsx");
  assert.match(rail, /href="\/premium"/, "the rail must carry the Premium pitch too");
  assert.match(rail, /Get Premium/, "…as a labelled call to action, not a bare icon");
  assert.doesNotMatch(rail, /"\/login"/, "the session control is the header's — the rail must not duplicate it");
});

test("the shimmer is defined once, guarded for reduced motion, and used on exactly one element", () => {
  // globals.css carries a tombstone explaining that a duplicated `float`
  // keyframe in both the config and the stylesheet silently shadowed the
  // config copy. Motion lives in the config; the gradient plumbing lives in
  // the stylesheet.
  const cfg = read("tailwind.config.ts");
  assert.match(cfg, /"premium-shimmer":/, "the keyframes must be declared in the Tailwind config");
  const css = read("src/app/globals.css");
  assert.ok(!/@keyframes\s+premium-shimmer/.test(css), "the keyframes must NOT be duplicated in globals.css");
  assert.match(css, /\.premium-shimmer/, "the utility class supplying the gradient must live in globals.css");
  assert.match(css, /@supports \(\(-webkit-background-clip: text\)/, "background-clip:text must be feature-guarded so the text can never render invisible");

  // Declared above the blanket prefers-reduced-motion block, which neutralises
  // animations with !important — see that block's own note on ordering.
  assert.ok(
    css.indexOf(".premium-shimmer") < css.indexOf("@media (prefers-reduced-motion: reduce)"),
    "the shimmer must be declared before the reduced-motion block",
  );

  const nav = read("src/components/Navbar.tsx");
  assert.match(nav, /animate-premium-shimmer[^"]*motion-reduce:animate-none/, "an infinite animation must opt out under reduced motion, same as MarketPulse's marquee");
  // Comments stripped first, so the explanatory note above the link doesn't
  // count as a usage. Exactly one element may carry it — the brief was
  // explicitly "the premium button", not the whole site.
  const navCode = nav.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.equal(
    (navCode.match(/className="premium-shimmer/g) ?? []).length,
    1,
    "the shimmer belongs to exactly one element, not the whole site",
  );
});

test("one tagline, on every surface that carries the Premium headline", () => {
  for (const file of [
    "src/app/premium/page.tsx",
    "src/components/PremiumDialog.tsx",
    "src/components/PremiumSlideIn.tsx",
    // SignupPromoPopup is deliberately NOT here since 2026-09-16: it sells the
    // free account and names no price, so it carries no Premium headline, no
    // tagline and no lock-in copy to keep in sync. Premium lives on the three
    // surfaces below plus PremiumSlideIn for signed-in visitors.
  ]) {
    const src = read(file);
    // 2026-09-14: "Get an unfair edge buying and selling" retired in favour of a
    // saving the reader makes rather than an advantage over other buyers. See
    // DECISIONS.md and tests/premium-positioning.test.ts, which guards the tone
    // the new line establishes. "Power tools for buyers" was the one before that.
    assert.match(src, /Never overpay for a Riftbound card/, `${file} must carry the current tagline`);
    for (const retired of [/[Pp]ower tools for buyers/, /unfair edge/i]) {
      assert.ok(!retired.test(src), `${file} still carries a retired tagline (${retired})`);
    }
  }
});

test("/premium's CTA is one big green button, with the price in the line beneath it", () => {
  const src = read("src/components/PremiumCta.tsx");
  assert.match(src, /const CTA_BTN = "btn-primary/, "the CTA must use the site's green primary-action class");
  assert.ok(!/bg-gold/.test(src), "this one component drops gold for green — see its own header for why the split is deliberate");
  assert.match(src, /w-full/, "the button must be full-bleed so it dominates the card");

  // The signed-out branch still carries every disclosure it is required to.
  // The button's own WORDING changed 2026-09-11 (see PremiumCta's own header
  // and DECISIONS.md): it names the tier now ("Get Plus"/"Get Premium"),
  // not the trial — but every required disclosure still has to survive that
  // restructure in the small print underneath.
  const signedOutAt = src.indexOf("if (!signedIn)");
  const signedOutBlock = src.slice(signedOutAt, src.indexOf("if (!checkoutLive)"));
  assert.match(signedOutBlock, /Get \{TIER_NAMES\[tier\]\}/, "the button itself must name the tier being sold");
  assert.match(signedOutBlock, /card is required/i, "the card-required disclosure must survive the restructure");
  assert.match(signedOutBlock, /priceLabel/, "the price must appear in the small print under the button");

  // The dialog and the gated-tool wall keep gold — the split is one page deep.
  assert.match(read("src/components/PremiumDialog.tsx"), /bg-gold/, "the dialog keeps the gold Premium button");
  assert.match(read("src/components/PremiumButton.tsx"), /bg-gold/, "the tool-wall button keeps the gold Premium button");
});

test("TrialPriceBlock kept its compact size and its honesty contract — still used by the dialog's trial flow", () => {
  // /premium itself stopped using TrialPriceBlock on 2026-09-11 (see
  // DECISIONS.md and PremiumPricingCards.tsx's own header): its "$0" headline
  // was the exact framing "maybe the $0 was a bad idea" retired, in favour of
  // a real-price-led card copying mtgstocks.com/go-premium's layout. The
  // component itself, and its honesty contract, still stand — PremiumDialog's
  // own trial-eligible price block still renders it.
  const src = read("src/components/TrialPriceBlock.tsx");
  assert.match(src, /"lg" \| "sm" \| "compact"/, "expected the compact size option");
  // The "$0 ... then $X after your N-day trial" pairing is load-bearing policy
  // (see the file's own header) — shrinking the $0 must not have split them.
  assert.match(src, /premiumZeroAmount\(\)/, "must still render the shared bare-$0 helper");
  assert.match(src, /after your \{dayPhrase\} free trial/, "the real price and when it starts must stay in the same block as the $0");

  const dialog = read("src/components/PremiumDialog.tsx");
  assert.match(dialog, /<TrialPriceBlock plan=\{activePlan\}/, "the dialog's trial-eligible branch must still render the shared block");

  const page = read("src/app/premium/page.tsx");
  assert.ok(!/<TrialPriceBlock/.test(page), "/premium no longer leads with the $0-headline block");
});

test("the 'Save N%' badge uses a brand shade that actually exists", () => {
  // brand only defines 400/500/600 in tailwind.config.ts, so `text-brand-300`
  // generated no class at all and the badge text fell back to inherited colour.
  for (const file of ["src/components/TrialPriceBlock.tsx", "src/components/AnnualPriceBlock.tsx"]) {
    assert.ok(!/text-brand-300/.test(read(file)), `${file} uses a brand shade that isn't defined`);
  }
});

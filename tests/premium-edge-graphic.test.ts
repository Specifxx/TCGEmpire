import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// The 2026-09-10 "make it visual" pass. Owner brief, four parts:
//   1. both corner nudges' text pitch → one PremiumEdgeGraphic
//   2. a gold, shimmering "✦ Premium" next to Database in the PHONE header
//   3. the tagline → "Get an unfair edge buying and selling"
//   4. /premium's CTA → one big green button, price demoted to the small print
// See DECISIONS.md for the two conventions this knowingly reverses (the
// retired shimmer, and gold-for-Premium on the /premium CTA specifically).
// ─────────────────────────────────────────────────────────────────────────────

const GRAPHIC = "src/components/PremiumEdgeGraphic.tsx";

test("the graphic is presentational only — no hooks, no client boundary, no data fetch", () => {
  const src = read(GRAPHIC);
  assert.ok(!/^"use client";/m.test(src), "must not be a client component — it renders from the server /premium tree too");
  assert.ok(!/\buseState\b|\buseEffect\b|\buseMe\b|\buseCountry\b/.test(src), "must not use any hook");
  assert.ok(!/fetch\(/.test(src), "must not fetch — it is a static illustration, not a live figure");
});

test("the graphic is accessible: a real role and a label that describes the claim", () => {
  const src = read(GRAPHIC);
  assert.match(src, /role="img"/, "an SVG conveying meaning needs role=img");
  const label = /aria-label="([^"]+)"/.exec(src);
  assert.ok(label && label[1].trim().length > 20, "expected a descriptive aria-label, not a stub");
});

test("the graphic states a real product difference and invents no numbers", () => {
  // The bars are an illustration, not a measurement. This repo fails builds
  // over invented figures, so the graphic is labelled with a difference that
  // is already published on /premium ("Free shows only the top pick" appears
  // verbatim in three FEATURES entries) rather than a made-up comparison.
  const src = read(GRAPHIC);
  assert.match(src, /every deal, ranked/, "the Premium bar must state the real entitlement");
  assert.match(src, /top pick only/, "the free bar must state the real free-tier limit");

  // No percentage, no currency amount, no "N deals" count rendered as text —
  // any of those would turn the illustration into a data claim.
  const textNodes = src.match(/>\s*[^<>{}\n]+\s*</g) ?? [];
  for (const node of textNodes) {
    assert.ok(!/\d+\s*%/.test(node), `graphic must not render a percentage: ${node.trim()}`);
    assert.ok(!/[$£€]\s*\d/.test(node), `graphic must not render a currency figure: ${node.trim()}`);
  }
  assert.ok(!/only \d+ (left|spots|seats)/i.test(src), "no fake scarcity");
  assert.ok(!/expires? in/i.test(src), "no countdown pressure");
});

test("both corner nudges render the graphic instead of a tool-chip row", () => {
  for (const file of ["src/components/SignupPromoPopup.tsx", "src/components/PremiumSlideIn.tsx"]) {
    const src = read(file);
    assert.match(src, /<PremiumEdgeGraphic/, `${file} must render the shared graphic`);
    assert.ok(
      !/PITCH_TOOLS\.map\(/.test(src),
      `${file} must no longer render the tool chip row the graphic replaced`,
    );
  }
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

test("the phone header carries a Premium link next to Database, without disturbing the desktop one", () => {
  const src = read("src/components/Navbar.tsx");
  // The FIRST /browse link in the file is the mobile one in the left cluster
  // (the desktop twin further down is gated lg:block).
  const dbAt = src.indexOf('href="/browse"');
  assert.ok(dbAt >= 0, "expected the mobile Database link");

  // The new link sits in the same left cluster and the same lg-and-below band.
  const after = src.slice(dbAt, dbAt + 1400);
  assert.match(after, /<PremiumNavLink/, "Premium must sit immediately after Database in the left cluster");
  assert.match(after, /lg:hidden/, "the mobile Premium link must be gated to the same band as Database");
  assert.match(after, /text-gold/, "it must be gold — the Premium identity colour");

  // The header's horizontal budget: nav links may not turn on before lg, and
  // the desktop Premium link must still defer to xl. Both are also pinned by
  // tests/signup-funnel.test.ts; repeated here because this change is what
  // would most plausibly break them.
  assert.ok(!/md:block md:px-2\.5/.test(src), "nav links must not turn on at md");
  assert.match(src, /<PremiumNavLink className="[^"]*\bxl:block\b/, "the desktop Premium link must still defer to xl");
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

test("the tagline replaced 'power tools' everywhere it was the Premium headline", () => {
  for (const file of [
    "src/app/premium/page.tsx",
    "src/components/PremiumDialog.tsx",
    "src/components/PremiumSlideIn.tsx",
    "src/components/SignupPromoPopup.tsx",
  ]) {
    const src = read(file);
    assert.match(src, /Get an unfair edge buying and selling/, `${file} must carry the new tagline`);
    assert.ok(!/[Pp]ower tools for buyers/.test(src), `${file} still carries the retired tagline`);
  }
});

test("/premium's CTA is one big green button, with the price in the line beneath it", () => {
  const src = read("src/components/PremiumCta.tsx");
  assert.match(src, /const CTA_BTN = "btn-primary/, "the CTA must use the site's green primary-action class");
  assert.ok(!/bg-gold/.test(src), "this one component drops gold for green — see its own header for why the split is deliberate");
  assert.match(src, /w-full/, "the button must be full-bleed so it dominates the card");

  // The signed-out branch still carries every disclosure it is required to.
  const signedOutAt = src.indexOf("if (!signedIn)");
  const signedOutBlock = src.slice(signedOutAt, src.indexOf("if (!checkoutLive)"));
  assert.match(signedOutBlock, /Start your \{trialDays\}-day free trial/, "the button itself must carry the headline ask");
  assert.match(signedOutBlock, /card is required/i, "the card-required disclosure must survive the restructure");
  assert.match(signedOutBlock, /priceLabel/, "the price must appear in the small print under the button");

  // The dialog and the gated-tool wall keep gold — the split is one page deep.
  assert.match(read("src/components/PremiumDialog.tsx"), /bg-gold/, "the dialog keeps the gold Premium button");
  assert.match(read("src/components/PremiumButton.tsx"), /bg-gold/, "the tool-wall button keeps the gold Premium button");
});

test("TrialPriceBlock gained a compact size so the button outranks the price, and kept its honesty contract", () => {
  const src = read("src/components/TrialPriceBlock.tsx");
  assert.match(src, /"lg" \| "sm" \| "compact"/, "expected the compact size option");
  // The "$0 ... then $X after your N-day trial" pairing is load-bearing policy
  // (see the file's own header) — shrinking the $0 must not have split them.
  assert.match(src, /premiumZeroAmount\(\)/, "must still render the shared bare-$0 helper");
  assert.match(src, /after your \{dayPhrase\} free trial/, "the real price and when it starts must stay in the same block as the $0");

  const page = read("src/app/premium/page.tsx");
  assert.match(page, /<TrialPriceBlock plan="monthly"[^/]*size="compact"/, "the monthly card must use the compact size");
  assert.match(page, /<TrialPriceBlock plan="annual"[^/]*size="compact"/, "the annual card must use the compact size");
});

test("the 'Save N%' badge uses a brand shade that actually exists", () => {
  // brand only defines 400/500/600 in tailwind.config.ts, so `text-brand-300`
  // generated no class at all and the badge text fell back to inherited colour.
  for (const file of ["src/components/TrialPriceBlock.tsx", "src/components/AnnualPriceBlock.tsx"]) {
    assert.ok(!/text-brand-300/.test(read(file)), `${file} uses a brand shade that isn't defined`);
  }
});

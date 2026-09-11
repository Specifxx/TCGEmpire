import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
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

test("every feature row names a real Premium-only entitlement, not a free one", () => {
  // The owner's comp advertised "Advanced filters — find the exact cards, sets
  // and rarities you want" and "See the best prices across stores instantly".
  // Both are the FREE tier in TIER_COMPARISON, so both were reworded. This
  // pins that the rows keep naming things that are actually behind the paywall.
  // Comments stripped first: the component's header deliberately QUOTES the
  // comp's original wording to record what was changed and why, so the raw
  // source legitimately contains both retired phrases.
  const src = read(PANEL);
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.ok(!/rarities you want/i.test(code), "browse/search filtering is free — must not be sold as Premium");
  assert.ok(
    !/best prices across stores/i.test(code),
    "cross-store price comparison is free for everyone — must not be sold as Premium",
  );
  for (const claim of ["Deal Finder", "Value Finder", "Bulk Pricer", "Best Basket", "Rising Cards", "Demand Finder"]) {
    assert.ok(code.includes(claim), `expected the rows to name the real Premium tool ${claim}`);
  }

  // No invented figures in the COPY. Scoped to the FEATURES rows rather than
  // the whole file, since Tailwind opacity and object-position values are
  // legitimately full of percentages.
  const rows = src.slice(src.indexOf("const FEATURES"), src.indexOf("export function PremiumPitchPanel"));
  const copy = (rows.match(/(?:title|body): "([^"]+)"/g) ?? []).join(" ");
  assert.ok(copy.length > 40, "expected to find the feature copy");
  assert.ok(!/\d+\s*%/.test(copy), "no invented percentage in the feature copy");
  assert.ok(!/[$£€]\s*\d/.test(copy), "no invented price in the feature copy");
  assert.ok(!/only \d+ (left|spots|seats)/i.test(code), "no fake scarcity");
  assert.ok(!/expires? in/i.test(code), "no countdown pressure");
});

test("the artwork is decorative, budgeted, and carries the alt attribute the build guard requires", () => {
  const src = read(PANEL);
  assert.match(src, /alt=""/, "the art restates nothing — empty alt is correct, and check-images requires the attribute");
  assert.match(src, /premium-pitch\.webp/, "expected the cropped comp artwork");
  const bytes = statSync(join(ROOT, "public/premium/premium-pitch.webp")).size;
  assert.ok(bytes < 150 * 1024, `artwork must stay inside the 150KB budget, is ${Math.round(bytes / 1024)}KB`);
});

test("both corner nudges render the graphic instead of a tool-chip row", () => {
  for (const file of ["src/components/SignupPromoPopup.tsx", "src/components/PremiumSlideIn.tsx"]) {
    const src = read(file);
    assert.match(src, /<PremiumPitchPanel/, `${file} must render the shared designed panel`);
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

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { trialDisclosure } from "../src/lib/site";

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


test("the header sells Pro with the shiny GetPremiumLink; rail and menu stay plain (2026-10-15)", () => {
  // Parts 1 and 2 of the 2026-09-10 brief are reversed: the owner moved every
  // upgrade prompt to where a free account hits a limit, "not in popups and
  // headers" (DECISIONS.md, "Free limits: charge for what people use every
  // week"). PremiumPitchPanel went with the slide-in; the header keeps a plain
  // "Pricing" link to /premium so the plans stay one tap away.
  const code = read("src/components/Navbar.tsx").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  const leftCluster = code.slice(code.indexOf("h-16 w-full items-center"), code.indexOf("<nav "));
  // REVERSED FOR THE HEADER 2026-10-15 (owner: "get premium … shiny … a
  // gradient and shining"): both header slots carry GetPremiumLink, whose
  // .premium-cta is the gold gradient and light sweep in globals.css.
  assert.match(leftCluster, /<GetPremiumLink/, "/premium stays reachable from the phone header");
  assert.match(code, /<GetPremiumLink[\s\S]*?\blg:inline-flex\b/, "and from the desktop row");
  assert.match(read("src/app/globals.css"), /^\.premium-cta \{/m, "the shiny button style");
  // Reworked twice the same day: first no gold fill ("the whole thing highlighted
  // … looks AI generated"), then no box at all ("I only want the font to be
  // glowing"). Only the label glows and shimmers.
  const css = read("src/app/globals.css");
  const cta = css.match(/^\.premium-cta \{[^}]*\}/m)![0];
  assert.match(cta, /background: none;/, "no fill");
  assert.doesNotMatch(cta, /box-shadow|border/, "no box glow and no outline");
  assert.doesNotMatch(css, /^\.premium-cta::(before|after)/m, "no ring or sweep on the box");
  assert.match(css, /^\.premium-cta-label \{[^}]*filter: drop-shadow/m, "the glow is on the letters");
  assert.match(read("src/components/GetPremiumLink.tsx"), /className="premium-cta-label"/, "the label carries the text shimmer");
  const rail = read("src/components/SideNav.tsx");
  assert.match(rail, /href="\/premium"/, "the rail still links the plans");
  assert.doesNotMatch(rail.slice(rail.indexOf("<PremiumNavLink")), /text-gold|border-gold/, "…without gold");
  const menu = read("src/components/UserMenu.tsx");
  const menuCode = menu.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  assert.doesNotMatch(menuCode, /Get Pro/);
  const menuLink = menuCode.slice(menuCode.indexOf("<PremiumNavLink"), menuCode.indexOf("</PremiumNavLink>"));
  assert.doesNotMatch(menuLink, /text-gold/, "the account menu's Pricing row is not gold");
  assert.doesNotMatch(read("tailwind.config.ts"), /premium-shimmer/);
  assert.doesNotMatch(read("src/app/globals.css"), /^\.premium-shimmer/m, "the old phone-only shimmer stays gone; .premium-cta replaced it");
});

test("one tagline, on every surface that carries the Pro headline", () => {
  // /premium's hero is "Know what you're missing. Buy it for less." since the
  // personas pass (2026-09-29); the tagline stays on the dialog and in the page title.
  // Since 2026-10-23 the hero is the one promise, "Never overpay for Riftbound
  // again." (PREMIUM_PROMISE, lib/premium-plan-copy.ts; DECISIONS.md "Premium,
  // rebranded around never overpaying").
  // Since the conversion redesign (2026-10-23, DECISIONS.md "/premium, rebuilt to
  // convert, honestly") /premium's H1 is the promise made concrete,
  // PREMIUM_HERO_HEADLINE; the promise stays the plan card's tagline and the dialog's.
  assert.match(read("src/app/premium/page.tsx"), /\$\{PREMIUM_HERO_HEADLINE\}\./);
  assert.match(read("src/lib/premium-plan-copy.ts"), /PREMIUM_PROMISE = "Never overpay for Riftbound again"/);
  assert.match(read("src/lib/premium-plan-copy.ts"), /PREMIUM_HERO_HEADLINE = "Find the lowest delivered price"/);
  for (const retired of [/[Pp]ower tools for buyers/, /unfair edge/i]) {
    assert.ok(!retired.test(read("src/app/premium/page.tsx")), `/premium still carries a retired tagline (${retired})`);
  }
  for (const file of [
    "src/components/PremiumDialog.tsx",
    // PremiumSlideIn carried it too until its removal on 2026-09-28.
    // SignupPromoPopup (removed 2026-09-30) was deliberately NOT here from 2026-09-16: it sold the
    // free account and names no price, so it carries no Premium headline, no
    // tagline and no lock-in copy to keep in sync. Premium lives on the three
    // surfaces below plus PremiumSlideIn for signed-in visitors.
  ]) {
    const src = read(file);
    // 2026-09-14: "Get an unfair edge buying and selling" retired in favour of a
    // saving the reader makes rather than an advantage over other buyers. See
    // DECISIONS.md and tests/premium-positioning.test.ts, which guards the tone
    // the new line establishes. "Power tools for buyers" was the one before that.
    assert.match(src, /\{PREMIUM_PROMISE\}/, `${file} must carry the current tagline`);
    for (const retired of [/[Pp]ower tools for buyers/, /unfair edge/i]) {
      assert.ok(!retired.test(src), `${file} still carries a retired tagline (${retired})`);
    }
  }
});

test("/premium's CTA is one big green button, with the price in the line beneath it", () => {
  const src = read("src/components/PremiumCta.tsx");
  assert.match(src, /const CTA_BTN = "btn-buy/, "the CTA must use the buy green (the pre-rebrand primary, kept for purchases on 2026-10-16)");
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
  // 2026-09-30: with a trial to sell the button reads "Start 30 days for $1"
  // (the plan card above it names the tier); the plain tier button remains for
  // everyone with no trial. The disclosure moved into the shared helper.
  assert.match(signedOutBlock, /trialDisclosure\(trialDays, trialFeeCents, thenPrice\)/, "the card-required disclosure must survive the restructure");
  assert.match(trialDisclosure(30, 100, "$2.99/mo"), /card is required/i);
  assert.match(src, /const thenPrice = priceLabel \|\|/, "the price must appear in the small print under the button");

  // The dialog and the gated-tool wall keep gold — the split is one page deep.
  assert.match(read("src/components/PremiumDialog.tsx"), /bg-gold/, "the dialog keeps the gold Pro button");
  assert.match(read("src/components/PremiumButton.tsx"), /bg-gold/, "the tool-wall button keeps the gold Pro button");
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
  assert.match(src, /premiumTrialFee\(feeCents\)/, "must still render the shared fee helper (the $1 due today)");
  assert.match(src, /after your \$\{dayPhrase\} free trial|after your \{dayPhrase\} free trial/, "a genuinely free trial (fee 0) still states the real price and when it starts in the same block");
  assert.match(src, /for your first \$\{trialDaysPhrase\(trialDays\)\}, then/, "the $1 trial states the real price and when it starts in the same block as the $1");

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

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


test("the header links to pricing plainly — no gold, no shimmer (2026-09-28)", () => {
  // Parts 1 and 2 of the 2026-09-10 brief are reversed: the owner moved every
  // upgrade prompt to where a free account hits a limit, "not in popups and
  // headers" (DECISIONS.md, "Free limits: charge for what people use every
  // week"). PremiumPitchPanel went with the slide-in; the header keeps a plain
  // "Pricing" link to /premium so the plans stay one tap away.
  const code = read("src/components/Navbar.tsx").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  const leftCluster = code.slice(code.indexOf("h-16 w-full items-center"), code.indexOf("<nav "));
  assert.match(leftCluster, /<PremiumNavLink/, "/premium stays reachable from the phone header");
  assert.match(leftCluster, />\s*Pricing\s*</);
  assert.doesNotMatch(code, /text-gold/, "no gold Premium CTA in the header");
  assert.doesNotMatch(code, /premium-shimmer/, "the shimmer is gone");
  assert.match(code, /<PremiumNavLink className="[^"]*\blg:block\b[^"]*"[^>]*>\s*Pricing\s*</, "the desktop link is plain Pricing");
  const rail = read("src/components/SideNav.tsx");
  assert.match(rail, /href="\/premium"/, "the rail still links the plans");
  assert.doesNotMatch(rail.slice(rail.indexOf("<PremiumNavLink")), /text-gold|border-gold/, "…without gold");
  const menu = read("src/components/UserMenu.tsx");
  const menuCode = menu.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  assert.doesNotMatch(menuCode, /Get Premium/);
  const menuLink = menuCode.slice(menuCode.indexOf("<PremiumNavLink"), menuCode.indexOf("</PremiumNavLink>"));
  assert.doesNotMatch(menuLink, /text-gold/, "the account menu's Pricing row is not gold");
  assert.doesNotMatch(read("tailwind.config.ts"), /premium-shimmer/);
  assert.doesNotMatch(read("src/app/globals.css"), /^\.premium-shimmer/m);
});

test("one tagline, on every surface that carries the Premium headline", () => {
  for (const file of [
    "src/app/premium/page.tsx",
    "src/components/PremiumDialog.tsx",
    // PremiumSlideIn carried it too until its removal on 2026-09-28.
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

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { INLINE_SIGNUP_SURFACES, SIGNUP_SOURCES } from "../src/lib/signup-source-shared";
import * as gate from "../src/lib/nudge-gate";
import { PREMIUM_MIN_ACCOUNT_AGE_MS, PREMIUM_MIN_VIEWS } from "../src/lib/nudge-gate";
import { NUDGE_DELAY_MS } from "../src/lib/nudge-timing";

// ─────────────────────────────────────────────────────────────────────────────
// THE SIGN-UP SLIDER IS GONE: SIGN-UP PROMPTS LIVE IN THE PAGE (2026-09-30,
// DECISIONS.md). Owner: "Let's get rid of the sign up slider altogether.
// Instead, within the site, have areas where it encourages the users to sign
// up... Users who don't want to sign up don't have to... The premium slider can
// stay."
//
// Pinned here: (1) nothing in the layout asks a signed-out visitor to sign up,
// and the Premium slide-in is untouched; (2) InlineSignupPrompt is page content,
// not an interruption, and sells only the free account; (3) where it is placed,
// once per page, never on the pages it must not be, with copy that states only
// what a free account gets.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const exists = (p: string) => existsSync(join(ROOT, p));
const code = (p: string) =>
  read(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const PROMPT = "src/components/InlineSignupPrompt.tsx";

// Where the prompt is placed, and the surface each placement reports.
const PLACEMENTS: Record<string, string> = {
  "src/app/browse/page.tsx": "inline_browse",
  "src/components/DeckBuilder.tsx": "inline_deck",
  "src/app/decks/[slug]/page.tsx": "inline_published_deck",
  "src/app/movers/page.tsx": "inline_movers",
  "src/app/champions/[slug]/page.tsx": "inline_champion",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(relative(ROOT, p).split("\\").join("/"));
  }
  return out;
}

/** Every `<InlineSignupPrompt … />` element in a file, comments stripped. */
function promptBlocks(file: string): string[] {
  const src = code(file);
  const out: string[] = [];
  let at = src.indexOf("<InlineSignupPrompt");
  while (at >= 0) {
    const end = src.indexOf("/>", at);
    out.push(src.slice(at, end + 2));
    at = src.indexOf("<InlineSignupPrompt", end);
  }
  return out;
}

// ── 1. No signed-out slider; the Premium slide-in unchanged ─────────────────

test("the layout mounts no signed-out sign-up nudge, and the file is gone", () => {
  const layout = read("src/app/layout.tsx");
  assert.doesNotMatch(layout, /SignupPromoPopup/, "no mount and no dynamic() import of the sign-up popup");
  assert.ok(!exists("src/components/SignupPromoPopup.tsx"), "SignupPromoPopup.tsx is deleted");
  // What only it used went with it.
  assert.ok(!exists("src/components/FreeAccountCompare.tsx"), "its comparison table is deleted");
  assert.ok(!exists("src/lib/signin-intent.ts"), "its sign-in-intent flag is deleted");
  // No other signed-out corner card crept into its place.
  assert.doesNotMatch(code("src/app/layout.tsx"), /<InlineSignupPrompt/, "the in-page prompt is page content, never a layout mount");
  for (const f of walk(join(ROOT, "src"))) {
    assert.doesNotMatch(read(f), /from "@\/components\/SignupPromoPopup"|from "\.\/SignupPromoPopup"/, `${f} imports the removed popup`);
  }
});

test("the Premium slide-in stays mounted, once, with its behaviour unchanged", () => {
  const layout = code("src/app/layout.tsx");
  assert.match(layout, /const PremiumSlideIn = dynamic\(\(\) => import\("@\/components\/PremiumSlideIn"\)/);
  assert.match(layout, /<PremiumSlideIn \/>/);
  assert.equal(layout.split("<PremiumSlideIn").length - 1, 1, "mounted once");
  assert.match(layout, /<AnnualSwitchNudge \/>/, "the annual offer stays too");

  const slide = code("src/components/PremiumSlideIn.tsx");
  // Signed in, no paid tier, checkout on, through the shared gate.
  assert.match(slide, /loaded && !!user && !premium && premiumCheckout && premiumSlideInEligible\(\{ views, accountAgeMs: ageMs, pathname \}\)/);
  // The 3rd view, the 48-hour account, the 12 s delay.
  assert.equal(PREMIUM_MIN_VIEWS, 3);
  assert.equal(PREMIUM_MIN_ACCOUNT_AGE_MS, 48 * 3_600_000);
  assert.equal(NUDGE_DELAY_MS, 12_000);
  assert.match(slide, /delayMs: NUDGE_DELAY_MS/);
  // Still the compact card.
  assert.match(slide, /max-w-\[20rem\] sm:w-80/, "compact when collapsed");
});

test("the two remaining corner nudges share one corner and z-tier", () => {
  // Moved here from tests/signup-slidein.test.ts (deleted with the popup it
  // pinned): globals.css's .above-bottombar + .left-4 rule depends on it.
  const CORNER = /above-bottombar fixed left-4 z-\[70\]/;
  assert.match(code("src/components/PremiumSlideIn.tsx"), CORNER);
  assert.match(code("src/components/AnnualSwitchNudge.tsx"), CORNER);
});

test("the nudge gate keeps no sign-up card rules to revive", () => {
  for (const name of ["signupPromoEligible", "signupEngagedNeededMs", "isLandingPage", "SIGNUP_SKIP_PATHS", "SIGNUP_MIN_VIEWS", "SIGNUP_ENGAGED_MS"]) {
    assert.ok(!(name in gate), `${name} is gone from lib/nudge-gate.ts`);
  }
  assert.doesNotMatch(code("src/lib/nudge-runtime.ts"), /useEngaged/, "the engaged-time clock only the popup read is gone");
});

// ── 2. The prompt is page content ───────────────────────────────────────────

test("InlineSignupPrompt: signed-out visitors only, after /api/me really answered, nothing before", () => {
  const src = code(PROMPT);
  assert.match(src, /const show = loaded && answered === true && !user;/);
  assert.match(src, /if \(!show\) return null;/, "nothing while loading, nothing for a member");
  assert.match(src, /<Suspense fallback=\{null\}>/, "and nothing in the server HTML");
});

test("InlineSignupPrompt: no timer, no modal, not fixed or sticky, no dismiss", () => {
  const src = code(PROMPT);
  assert.doesNotMatch(src, /setTimeout|setInterval|armNudge|NUDGE_DELAY_MS/, "it never waits to appear");
  assert.doesNotMatch(src, /\bfixed\b|\bsticky\b|z-\[|Dialog|useModalFlag|rcDialog|aria-modal/, "it is not an overlay");
  assert.doesNotMatch(src, /Dismiss|Maybe later|localStorage|sessionStorage/, "nothing to dismiss, nothing remembered");
});

test("InlineSignupPrompt: the free account only: no price, no gold, no Premium, no pressure", () => {
  const src = code(PROMPT);
  assert.doesNotMatch(src, /PREMIUM_PRICE|premiumZeroToday|premiumFromLine|premiumLockIn|\$\d/, "no price");
  assert.doesNotMatch(src, /\bgold\b/, "gold is the paid tiers' colour");
  assert.doesNotMatch(src, /PremiumButton|firePremiumClickBeacon|\/premium/, "no Premium ask");
  assert.doesNotMatch(src, /only \d+ (left|spots|seats)|expires? in|countdown|hurry|today only/i, "no scarcity or countdown");
  assert.doesNotMatch(src, /grantPremiumDays|grantPremiumMonths|signupPremiumDays/, "a link, never a grant");
  assert.match(src, /Create a free account/);
  assert.match(src, /Free, no card needed/, "and it says what signing up costs: nothing");
});

test("InlineSignupPrompt: /login with ?next= back to the page and ?src= for attribution", () => {
  const src = code(PROMPT);
  assert.match(src, /const back = next \?\? \(pathname \? `\$\{pathname\}\$\{qs \? `\?\$\{qs\}` : ""\}` : "\/"\);/);
  assert.match(src, /const href = `\/login\?next=\$\{encodeURIComponent\(back\)\}&src=\$\{surface\}`;/);
  assert.match(src, /rel="nofollow"/);
  // Every surface is a whitelisted sign-up source, so User.signupSource keeps it.
  for (const s of INLINE_SIGNUP_SURFACES) assert.ok(SIGNUP_SOURCES.has(s), s);
});

test("InlineSignupPrompt: an impression once per mount when seen, and a click, both by surface", () => {
  const src = code(PROMPT);
  assert.match(src, /new IntersectionObserver\(/);
  assert.match(src, /seen\(\);\s*io\.disconnect\(\);/, "once per mount");
  assert.match(src, /trackEvent\("signup_inline_view", \{ surface, copy: PREMIUM_COPY_VERSION \}\)/);
  assert.match(src, /trackEvent\("signup_inline_click", \{ surface, copy: PREMIUM_COPY_VERSION \}\)/);
  assert.match(src, /trackSignupCta\(surface\)/, "and the sign-up funnel's first step");
  assert.doesNotMatch(src, /signup_promo_/, "not the retired popup's event names");
});

// ── 3. Placements ───────────────────────────────────────────────────────────

test("placed where listed, once per page, one surface per placement", () => {
  const users = walk(join(ROOT, "src")).filter((f) => f !== PROMPT && /<InlineSignupPrompt\b/.test(code(f)));
  assert.deepEqual(users.sort(), Object.keys(PLACEMENTS).sort(), "update PLACEMENTS (and DECISIONS.md) when adding one");
  for (const [file, surface] of Object.entries(PLACEMENTS)) {
    const blocks = promptBlocks(file);
    assert.equal(blocks.length, 1, `${file}: exactly one prompt`);
    assert.match(blocks[0], new RegExp(`surface="${surface}"`), `${file} reports ${surface}`);
  }
  assert.deepEqual([...INLINE_SIGNUP_SURFACES].sort(), Object.values(PLACEMENTS).sort(), "every surface is placed exactly once");
});

test("never on sign-in, pricing, checkout, admin, embed or legal pages", () => {
  for (const file of Object.keys(PLACEMENTS)) {
    assert.doesNotMatch(file, /app\/(login|verify|premium|admin|embed|privacy|terms|editorial-policy|contact)\b/, file);
  }
});

test("each placement's copy states only what a free account gets, with the enforced numbers", () => {
  for (const file of Object.keys(PLACEMENTS)) {
    const block = promptBlocks(file)[0];
    // The limits come from lib/free-limits.ts, never typed.
    assert.doesNotMatch(block, /\b(10|50)\b/, `${file}: use FREE_WATCHLIST_LIMIT / FREE_PORTFOLIO_LIMIT, not a typed number`);
    // No paid tier, price or paid feature promised to a free account.
    assert.doesNotMatch(block, /Premium|Plus\b|\$(?!\{)|unlimited|store-by-store|target|deck (price )?watch|ad-free|no ads/i, `${file}: free account only`);
    assert.match(block, /free account/i, `${file}: says it is the free account`);
  }
  // A watchlist claim uses the enforced limit, and "drops in price" is what the
  // free alert run sends (lib/price-alerts.ts NEW LOW).
  for (const file of ["src/app/browse/page.tsx", "src/app/movers/page.tsx", "src/app/champions/[slug]/page.tsx", "src/components/DeckBuilder.tsx"]) {
    assert.match(promptBlocks(file)[0], /\$\{FREE_WATCHLIST_LIMIT\}/, file);
  }
  for (const file of ["src/app/browse/page.tsx", "src/app/champions/[slug]/page.tsx"]) {
    assert.match(promptBlocks(file)[0], /\$\{FREE_PORTFOLIO_LIMIT\}/, file);
  }
  // Best Basket: a free account sees its own delivered total (api/basket), and
  // the prompts say "delivered total", never the plan.
  for (const file of ["src/components/DeckBuilder.tsx", "src/app/decks/[slug]/page.tsx"]) {
    assert.match(promptBlocks(file)[0], /costs delivered in Best Basket/, file);
  }
});

test("below the content it follows, never above the results", () => {
  const browse = code("src/app/browse/page.tsx");
  assert.ok(browse.indexOf("<InlineSignupPrompt") > browse.indexOf("{cards.map((c) =>"), "inside the grid, after tiles");
  assert.match(browse, /const promptAfterId = cards\[Math\.min\(BROWSE_PROMPT_AFTER, cards\.length\) - 1\]\?\.id;/);
  assert.match(browse, /\{c\.id === promptAfterId && \(\s*<InlineSignupPrompt/);
  assert.match(browse, /const BROWSE_PROMPT_AFTER = 12;/);
  assert.match(browse, /className="col-span-full"/);
  const movers = code("src/app/movers/page.tsx");
  assert.ok(movers.indexOf("<InlineSignupPrompt") > movers.indexOf("<PriceWatch "), "after the movers lists");
  const deck = code("src/components/DeckBuilder.tsx");
  assert.ok(deck.indexOf("<InlineSignupPrompt") > deck.indexOf("{lines.map((l) =>"), "under the priced list");
  assert.match(deck, /\{lines\.length > 0 && \(\s*<InlineSignupPrompt/, "only once a list is priced");
  const published = code("src/app/decks/[slug]/page.tsx");
  assert.ok(published.indexOf("<InlineSignupPrompt") > published.indexOf("<PublishedDeckView"), "under the deck");
  const champ = code("src/app/champions/[slug]/page.tsx");
  assert.ok(champ.indexOf("<InlineSignupPrompt") > champ.indexOf("<CardTile"), "after the printings");
});

test("the pages stay cacheable: no session read, the same revalidate", () => {
  for (const file of Object.keys(PLACEMENTS).filter((f) => f.startsWith("src/app/"))) {
    const src = code(file);
    assert.doesNotMatch(src, /from "next\/headers"|getCurrentUser\(/, `${file} must not read the session for the prompt`);
  }
  assert.match(read("src/app/movers/page.tsx"), /export const revalidate = 86400;/);
  assert.match(read("src/app/champions/[slug]/page.tsx"), /export const revalidate = 86400;/);
  assert.match(read("src/app/decks/[slug]/page.tsx"), /export const revalidate = 3600;/);
});

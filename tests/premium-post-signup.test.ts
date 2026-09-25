import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tally, nudgeCopy, hasNudge, FREE_PREVIEW_ROWS, type PremiumNudge } from "../src/lib/premium-nudge";

// What a signed-in FREE account sees that leads to Premium, after sign-up.
// DECISIONS.md, "Premium after sign-up: the post-signup funnel", 2026-09-23.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (p: string) => read(p).replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

test("welcome checklist: the Premium step is optional, earned, and never shown to a member", () => {
  const src = code("src/components/WelcomeChecklist.tsx");
  // Free accounts only, checkout live, and only after the account has watched
  // a card — so it never greets someone the moment they arrive.
  assert.match(src, /const offerPremium = !premium && premiumCheckout && watchDone;/);
  // Not one of the core steps: the counter stays out of three.
  assert.match(src, /const doneCount = \[marketDone, watchDone, collectionDone\]\.filter\(Boolean\)\.length;/);
  assert.match(src, /\{doneCount\}\/3 done/);
  // Finishing the three core steps no longer hides the step from the quickest
  // users — it collapses to one card carrying it, unless there is nothing to offer.
  assert.match(src, /if \(doneCount === 3 && !offerPremium\) return null;/);
  assert.match(src, /You&apos;re set up/);
  // The trial is only promised when the account is eligible for one.
  assert.match(src, /const trialOffer = trialEligible && trialDays > 0;/);
  assert.match(src, /trialOffer \? `Try Premium free for \$\{trialDays\} days` : "See what Premium adds"/);
  assert.match(src, /<PremiumButton surface="checklist" \/>/, "attributed to the checklist");
  assert.doesNotMatch(src, /from "\.\/ui\/Dialog"/, "still inline, never a modal");
});

// ── Personal nudges (lib/premium-nudge.ts) ───────────────────────────────────

const nudge = (watched: Partial<PremiumNudge["watched"]>, owned: Partial<PremiumNudge["owned"]> = {}, example: PremiumNudge["example"] = null): PremiumNudge => ({
  watched: { deals: 0, dealsFree: 0, rising: 0, risingFree: 0, ...watched },
  owned: { deals: 0, dealsFree: 0, rising: 0, risingFree: 0, ...owned },
  example,
});

test("the free preview is the same three rows everywhere", () => {
  assert.equal(FREE_PREVIEW_ROWS, 3);
  for (const f of ["src/app/tools/deal-finder/page.tsx", "src/app/tools/rising/page.tsx"]) {
    assert.match(read(f), new RegExp(`const FREE_PREVIEW_ROWS = ${FREE_PREVIEW_ROWS};`), `${f} must agree with lib/premium-nudge.ts`);
  }
});

test("tally counts hits and which of them the free top 3 already shows", () => {
  const deals = new Map([["a", 1], ["b", 7], ["c", 20]]);
  const rising = new Map([["b", 2], ["d", 30]]);
  assert.deepEqual(tally(["a", "b", "x"], deals, rising), { deals: 2, dealsFree: 1, rising: 1, risingFree: 1 });
  assert.deepEqual(tally([], deals, rising), { deals: 0, dealsFree: 0, rising: 0, risingFree: 0 });
});

test("the copy is specific or absent — never a generic fallback", () => {
  assert.equal(nudgeCopy(nudge({}), "watched"), null);
  assert.equal(nudgeCopy(nudge({}), "owned"), null);
  assert.ok(!hasNudge(nudge({})));
  assert.ok(!hasNudge(null));

  const w = nudgeCopy(nudge({ deals: 4, dealsFree: 1, rising: 2 }, {}, { name: "Ahri, Nine-Tailed Fox", kind: "deal", set: "watched" }), "watched")!;
  assert.equal(w.heading, "4 cards you watch are underpriced right now");
  assert.match(w.line, /including Ahri, Nine-Tailed Fox\./);
  assert.match(w.line, /1 is in your free top 3\./);
  assert.match(w.line, /2 are also Rising Cards picks\./);

  const one = nudgeCopy(nudge({ deals: 1, dealsFree: 1 }), "watched")!;
  assert.equal(one.heading, "1 card you watch is underpriced right now");
  assert.match(one.line, /It's in your free top 3\./);

  const owned = nudgeCopy(nudge({}, { rising: 3, risingFree: 3 }), "owned")!;
  assert.equal(owned.heading, "3 cards you own are Rising Cards picks right now");
  assert.match(owned.line, /All are in your free top 3\./);
  // An example from the OTHER set is not claimed as this set's card.
  const cross = nudgeCopy(nudge({}, { rising: 1 }, { name: "Jinx", kind: "deal", set: "watched" }), "owned")!;
  assert.doesNotMatch(cross.line, /Jinx/);
});

test("the nudge never reveals a price or a gap — only counts and one name", () => {
  const src = code("src/lib/premium-nudge.ts");
  const copyFn = src.slice(src.indexOf("export function nudgeCopy"));
  assert.doesNotMatch(copyFn, /\w*Cents\b|\b(net|margin|gap|formatMoney)\b/, "Premium sells the numbers; the nudge only says they exist");
});

test("the nudge's reads are user-scoped and capped, and call the self-caching loaders directly", () => {
  const src = code("src/lib/premium-nudge.ts");
  assert.match(src, /priceAlert\.findMany\(\{ where: \{ userId \}, select: \{ cardId: true \}, take: 500 \}\)/);
  assert.match(src, /collectionCard\.findMany\(\{ where: \{ userId \}, select: \{ cardId: true \}, take: 1000 \}\)/);
  assert.match(src, /getTcgDealRanks\(country, defaultTcgBuyKeys\(country\)\)/);
  assert.match(src, /getCachedRisingCards\("GLOBAL"\)/);
  assert.doesNotMatch(src, /unstable_cache|cachedOrDirect/, "never wrap the self-caching loaders (src/lib/db.ts rule 6)");
  assert.match(src, /if \(!watched\.size && !owned\.size\) return null;/, "no cards of theirs, no ranking work at all");
});

test("Deal Finder and the nudge rank from one definition", () => {
  const arb = code("src/lib/arbitrage.ts");
  assert.match(arb, /async function rankVsTcgplayer\(country: Country, buyKeys: string\[\], sort: ArbSort\)/);
  assert.match(arb, /await rankVsTcgplayer\(country, buyKeys, opts\.sort\)/, "the page's loader uses it");
  assert.match(arb, /await rankVsTcgplayer\(country, keys, "saving"\)/, "and so do the nudge's ranks, in the default order");
  assert.match(read("src/app/tools/deal-finder/page.tsx"), /const tcgBuyKeys = defaultTcgBuyKeys\(country\);/);
});

test("where the nudge appears: watchlist, portfolio, and the slide-in", () => {
  const watching = read("src/app/watching/page.tsx");
  assert.match(watching, /!isPremium\(user\) && premiumCheckoutEnabled\(\) \? await getPremiumNudge\(user\.id, getCountry\(\)\)\.catch\(\(\) => null\)/);
  assert.match(watching, /<PremiumNudgeCard \{\.\.\.nudgeCopy\} surface="nudge:watchlist"/);
  const portfolio = read("src/app/portfolio/page.tsx");
  assert.match(portfolio, /!premium && premiumCheckoutEnabled\(\) && portfolio\.holdings\.length > 0/);
  assert.match(portfolio, /<PremiumNudgeCard \{\.\.\.ownedNudge\} surface="nudge:portfolio"/);

  const route = read("src/app/api/premium/nudge/route.ts");
  assert.match(route, /if \(!user \|\| isPremium\(user\) \|\| !premiumCheckoutEnabled\(\)\) return none;/);
  assert.match(route, /"Cache-Control": "private, no-store"/);

  const slide = code("src/components/PremiumSlideIn.tsx");
  assert.match(slide, /const PERSONAL_WAIT_MS = 1500;/);
  assert.match(slide, /personal\?\.heading \?\? contextPitch\?\.heading/, "personal copy outranks the per-page pitch");
  // Fetched inside the show timer, and the session is only marked seen once
  // the card will really appear.
  const timer = slide.slice(slide.indexOf("const t = setTimeout(async () => {"), slide.indexOf("}, NUDGE_DELAY_MS);"));
  assert.ok(timer.indexOf("await fetchPersonalCopy()") < timer.indexOf("ss?.setItem(SESSION_SEEN"), "SESSION_SEEN after the wait");
  assert.match(timer, /if \(cancelled \|\| dialogOpen\(\)\) return;/);
});

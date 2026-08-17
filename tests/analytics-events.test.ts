import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// GA4 event instrumentation. buy_click already existed (OutboundLink, see
// tests/business-diagnostic-fixes.test.ts); these pin the previously-missing
// events, each wired to a real UI action rather than a raw scattered gtag call.

test("trackEvent() mirrors to both Vercel Analytics and GA4, with an undefined-gtag guard", () => {
  const src = read("src/lib/analytics.ts");
  assert.match(src, /vercelTrack\(name, params\)/);
  assert.match(src, /window\.gtag\?\.\("event", name, params\)/);
  assert.match(src, /typeof window !== "undefined"/, "must guard the window access for any non-browser caller");
});

test("card_search fires on submit with the term and the already-resolved preview count", () => {
  const src = read("src/components/SearchBar.tsx");
  assert.match(src, /trackEvent\("card_search", \{ search_term: q, results_count: results\.length \+ sealed\.length \}\)/);
  // Must not fire for an empty query (that's "browse everything", not a search).
  assert.match(src, /if \(q\) trackEvent\("card_search"/);
});

test("region_switch fires from the homepage hero toggle with both region codes, and skips a no-op click", () => {
  const src = read("src/components/CountryHeroToggle.tsx");
  assert.match(src, /trackEvent\("region_switch", \{ from_region: country, to_region: c\.code \}\)/);
  const onClickBody = src.slice(src.indexOf("onClick={() => {"), src.indexOf("aria-pressed"));
  assert.match(onClickBody, /if \(active\) return;/, "the guard must come before the track call, not after");
});

test("pack_sim_open fires once per mount; pack_sim_pack_opened fires once a real pack resolves", () => {
  const src = read("src/components/games/PackSim.tsx");
  const openStart = src.indexOf('trackEvent("pack_sim_open"');
  assert.ok(openStart > -1, "expected a pack_sim_open trackEvent call");
  assert.match(src, /trackEvent\("pack_sim_open", \{ set_id: setCode \}\)/);
  // Its effect must have an empty dep array — once per page view, not once per
  // set change.
  const line = src.split("\n").find((l) => l.includes("pack_sim_open"));
  assert.ok(line, "expected the pack_sim_open call on its own line");
  assert.match(line!, /useEffect\(\(\) => \{ trackEvent\("pack_sim_open", \{ set_id: setCode \}\); \}, \[\]\);/);

  const openPackStart = src.indexOf("const openPack");
  const openPackCatch = src.indexOf("} catch {", openPackStart + "const openPack".length);
  assert.ok(openPackCatch > openPackStart, "expected to find openPack's own catch block after its declaration");
  const openPackBody = src.slice(openPackStart, openPackCatch);
  // Must be inside the try block, after the fetched cards are confirmed
  // non-empty (the `if (!d.cards?.length) throw` above it) — never fired for a
  // failed/empty pack.
  assert.match(openPackBody, /if \(!d\.cards\?\.length\) throw new Error\(\);[\s\S]*trackEvent\("pack_sim_pack_opened", \{ set_id: setCode \}\)/);
});

test("deck_view fires when a meta deck's page renders, with its slug and archetype", () => {
  const src = read("src/components/DeckView.tsx");
  assert.match(src, /trackEvent\("deck_view", \{ deck_id: deck\.slug, archetype: deck\.archetype \}\)/);
});

test("deck_create fires only on a real user click, not the auto-price-from-shared-link or the market-change re-price", () => {
  const src = read("src/components/DeckBuilder.tsx");
  assert.match(src, /if \(isUserAction\) trackEvent\("deck_create"/);
  assert.match(src, /onClick={\(\) => price\(text, true\)}/, "the explicit Price button must pass isUserAction=true");
  // Every OTHER price(...) call site must call it with exactly one argument
  // (isUserAction defaults to false) — never a second `true` argument.
  const calls = [...src.matchAll(/\bprice\(([^)]*)\)/g)].map((m) => m[1].trim());
  const nonButtonCalls = calls.filter((args) => args !== "text, true");
  assert.ok(nonButtonCalls.length >= 2, "expected the auto-price and market-change price() calls too");
  for (const args of nonButtonCalls) {
    assert.ok(!args.includes("true"), `price(${args}) must not opt into deck_create — only the explicit button click does`);
  }
});

test("best_basket_build fires once a plan is actually built, from BOTH ways a basket can be built", () => {
  // BestBasket has two paths to a result: runLines() (primary — search and
  // pick a card at a time) and runPasted() (secondary "advanced" decklist
  // paste). "a best-basket result generated" applies to either, so both must
  // fire the event, not just whichever one happened to exist when this was
  // first wired up.
  const src = read("src/components/BestBasket.tsx");
  const CALL = 'trackEvent("best_basket_build", { card_count: built.matchedCards, total_price: built.totalCents / 100, region: country })';
  for (const fn of ["runLines", "runPasted"]) {
    const start = src.indexOf(`async function ${fn}`);
    assert.ok(start > -1, `expected a ${fn}() function`);
    const end = src.indexOf("\n  }", src.indexOf("try {", start));
    const body = src.slice(start, end);
    assert.ok(body.includes(CALL), `${fn}() must fire best_basket_build once its plan resolves`);
    // Must come after setPlan, i.e. only once the plan is known-good (res.ok
    // was already checked and returned early above).
    assert.ok(body.indexOf("setPlan(built)") < body.indexOf(CALL), `${fn}() must fire best_basket_build AFTER setting the plan, not before it's known to exist`);
  }
});

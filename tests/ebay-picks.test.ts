import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { selectPicks, MAX_TILES, type PickListing } from "../src/components/EbayPicksLive";
import { getArticles } from "../src/lib/articles";

// ─────────────────────────────────────────────────────────────────────────────
// The tailored eBay unit (thumbnail + card name + live price).
//
// Two classes of bug are worth fencing here:
//   1. tile selection — showing the same card four times, or leaking another
//      market's listings (and therefore another currency) into the strip;
//   2. the affiliate contract — EPN has flagged surfaces carrying eBay links
//      with no disclosure, and Premium is ad-free everywhere else on the site.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const L = (o: Partial<PickListing> & { cardId: string; country: string; priceCents: number }): PickListing => ({
  cardName: `Card ${o.cardId}`,
  shippingCents: null,
  currency: "AUD",
  url: "https://ebay.example/x",
  imageUrl: "https://i.ebayimg.example/x.jpg",
  title: "seller title",
  ...o,
});

test("only the visitor's market is shown", () => {
  const picks = selectPicks(
    [L({ cardId: "a", country: "AU", priceCents: 100 }), L({ cardId: "b", country: "US", priceCents: 50 })],
    "AU",
  );
  assert.equal(picks.length, 1);
  assert.equal(picks[0].cardId, "a", "a US listing must never appear in the AU strip");
});

test("one tile per card — the cheapest listing wins", () => {
  const picks = selectPicks(
    [
      L({ cardId: "a", country: "AU", priceCents: 900 }),
      L({ cardId: "a", country: "AU", priceCents: 300 }),
      L({ cardId: "a", country: "AU", priceCents: 600 }),
      L({ cardId: "b", country: "AU", priceCents: 400 }),
    ],
    "AU",
  );
  assert.deepEqual(
    picks.map((p) => [p.cardId, p.priceCents]),
    [
      ["a", 300],
      ["b", 400],
    ],
    "the strip must show variety, not one card at four prices",
  );
});

test("tiles are ordered cheapest first and capped to one row", () => {
  const many = Array.from({ length: 20 }, (_, i) => L({ cardId: `c${i}`, country: "AU", priceCents: 1000 - i }));
  const picks = selectPicks(many, "AU");
  assert.equal(picks.length, MAX_TILES);
  const prices = picks.map((p) => p.priceCents);
  assert.deepEqual(prices, [...prices].sort((a, b) => a - b), "cheapest first");
});

test("an empty market yields no tiles, so the CTA fallback takes over", () => {
  assert.deepEqual(selectPicks([L({ cardId: "a", country: "AU", priceCents: 100 })], "SG"), []);
  assert.deepEqual(selectPicks([], "AU"), []);
});

// ── Affiliate + ad contract ──────────────────────────────────────────────────

test("the unit is Premium-gated and always carries a disclosure", () => {
  const src = read("src/components/EbayPicksLive.tsx");
  assert.match(src, /if \(adFree\) return null/, "Premium is ad-free sitewide");
  assert.match(src, /<AffiliateDisclosure partner="ebay"/, "EPN requires a disclosure under the links");
  assert.match(src, /<EbayBuyCta/, "the eBay buy-path must survive an empty market");
});

test("clicks are attributable to this unit", () => {
  const src = read("src/components/EbayPicksLive.tsx");
  assert.match(src, /retailer="ebay_picks"/, "needs its own retailer key to measure against the banners");
});

test("listings are freshness-filtered before they can claim to be live", () => {
  const src = read("src/components/EbayPicks.tsx");
  // Stale is worse than empty here: rows outliving their listings would advertise
  // sold items under a "live" heading with affiliate links on them.
  assert.match(src, /MAX_AGE_HOURS/);
  assert.match(src, /updatedAt: \{ gte:/, "must drop rows the import hasn't refreshed");
  assert.match(src, /rank: 0/, "only the cheapest captured listing per card");
});

test("the server half stays cookie-free so host pages remain cacheable", () => {
  const src = read("src/components/EbayPicks.tsx");
  assert.ok(!src.includes("getCountry("), "reading cookies here would force every host page dynamic");
  assert.match(src, /unstable_cache/, "five high-traffic pages must not hit Postgres per request");
  assert.match(src, /tags: \[CONTENT_TAG\]/, "refresh with the daily import");
});

// ── Placement ────────────────────────────────────────────────────────────────

test("the unit is on all five requested pages", () => {
  // "/" renders it via HomeSections.tsx (shared with the 5 region home pages)
  // rather than inline — see that file's own header comment.
  assert.match(read("src/components/home/HomeSections.tsx"), /<EbayPicks \/>/, "/ must render it");
  assert.match(read("src/app/browse/page.tsx"), /<EbayPicks /, "/browse must render it");

  // The three articles opt in through data, not a slug check in the view.
  const wanted = [
    "every-riftbound-vendetta-card-revealed",
    "riftbound-vendetta-chase-cards-so-far",
    "riftbound-empower-explained",
  ];
  const bySlug = new Map(getArticles().map((a) => [a.slug, a]));
  for (const slug of wanted) {
    const a = bySlug.get(slug);
    assert.ok(a, `article ${slug} must exist`);
    assert.ok(a.ebayPicks, `article ${slug} must opt into ebayPicks`);
  }
  assert.match(read("src/components/ArticleView.tsx"), /article\.ebayPicks && \(/, "ArticleView must honour the flag");
});

test("it stays opt-in — not silently applied to every article", () => {
  // An explicit allowlist rather than a count. The point of this guard is that
  // the unit never spreads to articles nobody chose it for, and a bare
  // `length === 3` did not actually enforce that — swapping which three articles
  // opted in would have passed it unchanged. Naming them catches both directions:
  // a new article silently gaining the unit, and an existing one silently losing
  // it. Add a slug here only alongside a reason it belongs.
  const ALLOWED = new Set([
    // Vendetta spoiler/chase content — readers are shopping by sight.
    "every-riftbound-vendetta-card-revealed",
    "riftbound-vendetta-chase-cards-so-far",
    "riftbound-empower-explained",
    // Same reason: a chase-card listicle whose readers arrive to buy a printing,
    // not to learn a rule. It is also the guide the tailored unit suits best —
    // the article IS a list of the cards the strip shows.
    "most-valuable-riftbound-cards",
  ]);
  const optedIn = getArticles().filter((a) => a.ebayPicks).map((a) => a.slug);
  const unexpected = optedIn.filter((s) => !ALLOWED.has(s));
  assert.deepEqual(unexpected, [], `article(s) opted into ebayPicks without being allowlisted: ${unexpected.join(", ")}`);
  assert.equal(
    optedIn.length,
    ALLOWED.size,
    `expected exactly the ${ALLOWED.size} allowlisted articles, got ${optedIn.length} (${optedIn.join(", ")})`,
  );
});

// ── Mobile ───────────────────────────────────────────────────────────────────

test("mobile gets a snap-scrolling strip and desktop a grid, from one DOM", () => {
  const src = read("src/components/EbayPicksLive.tsx");
  assert.match(src, /snap-x snap-mandatory/, "phones scroll the strip");
  assert.match(src, /sm:grid/, "tablet and up get a grid");
  assert.match(src, /sm:snap-none/, "snap must be released once it is a grid");
  assert.match(src, /overflow-x-auto/);
  assert.match(src, /sm:overflow-visible/, "the scroll affordance must not linger on desktop");
  // One set of tiles, not a hidden duplicate per breakpoint — duplicated markup
  // would double-count impressions and ship two copies of every thumbnail.
  assert.equal(src.match(/<OutboundLink/g)?.length, 1, "exactly one tile template");
  assert.match(src, /aspect-\[3\/4\]/, "fixed aspect box reserves space, so CLS stays at zero");
  assert.match(src, /loading="lazy"/);
});

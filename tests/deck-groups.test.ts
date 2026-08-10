import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { COUNTRIES, COUNTRY_LIST } from "../src/lib/country";
import { formatMoney } from "../src/lib/format";
import { META_DECKS } from "../src/lib/meta-decks";
import { getArticles } from "../src/lib/articles";
import { SECTIONS } from "../src/lib/sitemap-sections";
import {
  ARCHETYPE_GROUPS,
  DECK_GROUPS,
  DECK_GROUP_THIN_THRESHOLD,
  DECK_PRICE_COVERAGE_MIN,
  DOMAIN_DECK_GROUPS,
  MAX_AVG_CARD_CENTS,
  MIN_AVG_CARD_CENTS,
  archetypeParts,
  cheapestPublishableDeck,
  deckCostVerdict,
  deckGroupBySlug,
  deckGroupDescription,
  deckGroupHeading,
  deckGroupIsIndexable,
  deckGroupPath,
  deckGroupTitle,
  deckInGroup,
  groupStaples,
  indexableDeckGroups,
  liveDeckGroups,
  seedsInGroup,
  TITLE_SUFFIX,
} from "../src/lib/deck-groups";
import {
  deckGroupFaq,
  deckGroupFaqLd,
  deckGroupItemListLd,
  type DeckGroupLdInput,
} from "../src/lib/deck-group-jsonld";

// ─────────────────────────────────────────────────────────────────────────────
// The programmatic deck-group surface (/decks/archetype/*, /decks/domain/*).
//
// SOURCE-AND-SEED-LEVEL ON PURPOSE, like tests/deck-seo.test.ts and
// tests/seo-landing-pages.test.ts: `npm test` runs with no database and no
// server (see .github/workflows/ci.yml), so a rendered-HTML assertion could not
// gate a PR. Everything a page generator can get wrong BEFORE it renders —
// inventing a group no deck belongs to, minting two pages with the same title,
// submitting a URL it also noindexes, quoting a build cost from four resolved
// cards — is decidable from the seed data alone, and is decided here.
//
// The rendered half (every URL 200s, one canonical per page, valid JSON-LD in
// the actual HTML) is scripts/seo-gate.ts, which needs a running server.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
// Source assertions below are about EMITTED CODE, not prose — these files
// document why there is no hardcoded currency, and those comments would
// otherwise trip the very checks that enforce it.
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const ARCHETYPE_ROUTE = "src/app/decks/archetype/[slug]/page.tsx";
const DOMAIN_ROUTE = "src/app/decks/domain/[slug]/page.tsx";

// ── The allowlist may not drift from the real decklists ──────────────────────

test("every group is backed by at least one real tournament list, or renders nowhere", () => {
  // The failure this catches: someone adds a group for a query they'd like to
  // rank for, and it mints a URL with nothing behind it.
  for (const g of liveDeckGroups()) {
    assert.ok(seedsInGroup(g).length > 0, `${deckGroupPath(g)} is "live" with no decks`);
  }
  const dead = DECK_GROUPS.filter((g) => seedsInGroup(g).length === 0);
  for (const g of dead) {
    assert.ok(
      !liveDeckGroups().includes(g) && !indexableDeckGroups().includes(g),
      `${deckGroupPath(g)} has no decks and must neither render nor be submitted`,
    );
  }
});

test("no real archetype fragment is left without a group covering it", () => {
  // The opposite drift: a new decklist introduces an archetype word
  // ("Control", say) and nothing on the site groups it, so the deck is
  // reachable only from /decks.
  const parts = new Set(META_DECKS.flatMap((d) => archetypeParts(d.archetype)));
  for (const p of parts) {
    const covered = ARCHETYPE_GROUPS.some((g) =>
      META_DECKS.some((d) => archetypeParts(d.archetype).includes(p) && deckInGroup(d, g)),
    );
    assert.ok(covered, `archetype fragment ${JSON.stringify(p)} has no group — add one to ARCHETYPE_GROUPS`);
  }
});

test("every group token matches something real", () => {
  for (const g of DECK_GROUPS) {
    assert.ok(g.tokens.length > 0, `${g.slug} needs at least one token`);
    for (const t of g.tokens) {
      assert.equal(t, t.toLowerCase(), `${g.slug}: token ${JSON.stringify(t)} must be lowercase`);
    }
  }
  // Domain groups are generated from DOMAIN_KEYS, so they can't name a domain
  // the rest of the site doesn't know — assert the reverse direction instead:
  // every domain a deck actually plays has a group.
  const played = new Set(META_DECKS.flatMap((d) => d.domains.map((x) => x.toLowerCase())));
  for (const d of played) {
    assert.ok(
      DOMAIN_DECK_GROUPS.some((g) => g.tokens.includes(d)),
      `domain ${JSON.stringify(d)} is played by a real deck but has no /decks/domain page`,
    );
  }
});

test("slugs are unique and URL-safe within each axis", () => {
  for (const axis of ["archetype", "domain"] as const) {
    const slugs = DECK_GROUPS.filter((g) => g.axis === axis).map((g) => g.slug);
    assert.equal(new Set(slugs).size, slugs.length, `${axis}: duplicate slugs`);
    for (const s of slugs) assert.match(s, /^[a-z0-9-]+$/, `${axis}: slug ${JSON.stringify(s)} is not URL-safe`);
  }
  // Cross-axis collisions are legal (different paths) but a group must always
  // resolve back to itself through the same lookup the route uses.
  for (const g of DECK_GROUPS) {
    assert.equal(deckGroupBySlug(g.axis, g.slug), g, `${deckGroupPath(g)} does not round-trip through deckGroupBySlug`);
    assert.equal(deckGroupBySlug(g.axis, g.slug.toUpperCase()), g, `${deckGroupPath(g)} lookup must be case-insensitive`);
  }
});

// ── Duplicate / thin content ─────────────────────────────────────────────────

test("every generated title and description is unique, non-empty and in range", () => {
  const titles = new Map<string, string>();
  const descs = new Map<string, string>();
  const headings = new Map<string, string>();
  for (const g of liveDeckGroups()) {
    const path = deckGroupPath(g);
    const t = deckGroupTitle(g);
    const d = deckGroupDescription(g);
    const h = deckGroupHeading(g);

    assert.ok(t.trim().length > 0, `${path}: empty title`);
    assert.ok(d.trim().length > 0, `${path}: empty description`);
    assert.ok(h.trim().length > 0, `${path}: empty h1`);

    assert.ok(!titles.has(t), `duplicate title ${JSON.stringify(t)} on ${path} and ${titles.get(t)}`);
    assert.ok(!descs.has(d), `duplicate description on ${path} and ${descs.get(d)}`);
    assert.ok(!headings.has(h), `duplicate h1 on ${path} and ${headings.get(h)}`);
    titles.set(t, path);
    descs.set(d, path);
    headings.set(h, path);

    // Google truncates the SERP title around 60 characters, and the root layout
    // appends " — RiftCompare" to every one of these.
    assert.ok(
      (t + TITLE_SUFFIX).length <= 60,
      `${path}: title renders at ${(t + TITLE_SUFFIX).length} chars — "${t}${TITLE_SUFFIX}"`,
    );
    // Long enough to say something, short enough to render whole.
    assert.ok(d.length >= 110 && d.length <= 320, `${path}: description is ${d.length} chars`);
    // The title must not equal the H1 — they target different jobs, and a page
    // where they're identical is a page that thought about neither.
    assert.notEqual(t.toLowerCase(), h.toLowerCase(), `${path}: title and h1 are identical`);
  }
});

test("no generated title collides with an existing article or hub title", () => {
  // Two of our own URLs chasing one query helps neither — the same rule
  // tests/seo-landing-pages.test.ts enforces for the gallery.
  const existing = new Set(getArticles().map((a) => a.title.toLowerCase()));
  for (const g of liveDeckGroups()) {
    const t = deckGroupTitle(g).toLowerCase();
    assert.ok(!existing.has(t), `${deckGroupPath(g)} title collides with an article: ${t}`);
  }
});

test("the domain deck pages do not chase the domain CARD pages' query", () => {
  // /domains/<slug> owns "riftbound fury cards"; /decks/domain/<slug> owns
  // "riftbound fury decks". If either title ever claims the other's noun they
  // are competing with each other again.
  const cardPageTitle = /Riftbound \$\{domain\.label\} Cards/;
  assert.match(read("src/app/domains/[slug]/page.tsx"), cardPageTitle, "domain card page must still claim 'Cards'");
  for (const g of DOMAIN_DECK_GROUPS) {
    const t = deckGroupTitle(g);
    assert.ok(/Decks/.test(t), `${deckGroupPath(g)} must claim 'Decks'`);
    assert.ok(!/\bCards\b/.test(t), `${deckGroupPath(g)} must not claim 'Cards' — that is /domains/${g.slug}`);
  }
});

test("a group page always has enough real content to be worth a URL", () => {
  // "Thin" here is measured in the units the page is actually made of: real
  // decklists, real editorial sentences, and a staples table that differs
  // between groups. Anything below this renders but is not submitted.
  for (const g of indexableDeckGroups()) {
    const seeds = seedsInGroup(g);
    assert.ok(
      seeds.length >= DECK_GROUP_THIN_THRESHOLD,
      `${deckGroupPath(g)} is submitted with ${seeds.length} decks`,
    );
    // Each group's own editorial copy, before any per-deck content is added.
    const words = `${g.summary} ${g.buyerAngle} ${deckGroupDescription(g)}`.split(/\s+/).filter(Boolean).length;
    assert.ok(words >= 80, `${deckGroupPath(g)} carries only ${words} words of its own copy`);
    // …and it must not be shared with another group.
    for (const other of DECK_GROUPS) {
      if (other === g) continue;
      assert.notEqual(g.summary, other.summary, `${g.slug} and ${other.slug} share a summary`);
      assert.notEqual(g.buyerAngle, other.buyerAngle, `${g.slug} and ${other.slug} share a buyer angle`);
    }
  }
});

test("staples are computed per group, not templated", () => {
  // The section that makes two group pages genuinely different documents. If it
  // returned the same rows everywhere, the pages would be near-duplicates.
  const withStaples = liveDeckGroups()
    .map((g) => ({ g, staples: groupStaples(seedsInGroup(g)) }))
    .filter((x) => x.staples.length > 0);
  assert.ok(withStaples.length >= 2, "expected at least two groups to have shared staples");
  const signatures = new Set(withStaples.map((x) => x.staples.map((s) => s.name).join("|")));
  assert.ok(signatures.size > 1, "every group produced an identical staples list");

  for (const { g, staples } of withStaples) {
    for (const s of staples) {
      assert.ok(s.deckCount >= 2, `${g.slug}: ${s.name} listed as a staple of one deck`);
      assert.ok(s.deckCount <= seedsInGroup(g).length, `${g.slug}: ${s.name} counted in more decks than exist`);
      assert.ok(s.maxQty >= 1, `${g.slug}: ${s.name} has a non-positive quantity`);
      assert.ok(s.section !== "rune" && s.section !== "sideboard", `${g.slug}: ${s.name} should be excluded`);
    }
  }
  // A single deck can never produce staples — "shared" needs two lists.
  assert.equal(groupStaples([META_DECKS[0]]).length, 0);
});

// ── Data integrity: never publish a price we can't stand behind ──────────────

const costOf = (totalCents: number, pricedCards: number, priceableCards: number) => ({
  totalCents,
  pricedCards,
  priceableCards,
});

test("deckCostVerdict rejects nulls, zeros and empty baskets", () => {
  assert.equal(deckCostVerdict(costOf(0, 0, 44)).ok, false, "an unpriced deck must not publish a cost");
  assert.equal(deckCostVerdict(costOf(0, 44, 44)).ok, false, "a zero total must not publish");
  assert.equal(deckCostVerdict(costOf(12_000, 0, 44)).ok, false, "a total with no priced cards must not publish");
  assert.equal(deckCostVerdict(costOf(12_000, 44, 0)).ok, false, "a deck with no priceable cards must not publish");
  assert.equal(deckCostVerdict(costOf(-500, 44, 44)).ok, false, "a negative total must not publish");
  assert.equal(deckCostVerdict(costOf(Number.NaN, 44, 44)).ok, false, "NaN must not publish");
  assert.equal(deckCostVerdict(costOf(Number.POSITIVE_INFINITY, 44, 44)).ok, false, "Infinity must not publish");
  assert.equal(deckCostVerdict(costOf(0, 0, 0)).reason, "no-cards");
});

test("deckCostVerdict rejects a total drawn from too few resolved cards", () => {
  // The silent one: real arithmetic over an unreal basket. 4 of 44 cards priced
  // produces a number that looks like a deck price and is nothing like one.
  const barelyUnder = Math.floor(44 * DECK_PRICE_COVERAGE_MIN) - 1;
  assert.equal(deckCostVerdict(costOf(9_900, barelyUnder, 44)).ok, false);
  assert.equal(deckCostVerdict(costOf(9_900, barelyUnder, 44)).reason, "low-coverage");
  const atThreshold = Math.ceil(44 * DECK_PRICE_COVERAGE_MIN);
  assert.equal(deckCostVerdict(costOf(9_900, atThreshold, 44)).ok, true);
});

test("deckCostVerdict rejects out-of-band per-card averages in both directions", () => {
  // A misplaced decimal in a scraped listing, caught scale-free.
  const tooCheap = MIN_AVG_CARD_CENTS * 44 - 44;
  assert.equal(deckCostVerdict(costOf(tooCheap, 44, 44)).reason, "out-of-band");
  const tooDear = (MAX_AVG_CARD_CENTS + 1) * 44;
  assert.equal(deckCostVerdict(costOf(tooDear, 44, 44)).reason, "out-of-band");
  // A realistic top-tier list stays inside the band.
  assert.equal(deckCostVerdict(costOf(44_300, 44, 44)).ok, true);
});

test("cheapest picks the cheapest PUBLISHABLE deck, never a broken-data one", () => {
  const decks = [
    { slug: "real-cheap", ...costOf(9_900, 44, 44) },
    { slug: "real-dear", ...costOf(44_300, 44, 44) },
    // Would sort cheapest of all, and is exactly the row that must not win.
    { slug: "barely-resolved", ...costOf(300, 2, 44) },
    { slug: "unpriced", ...costOf(0, 0, 44) },
  ];
  assert.equal(cheapestPublishableDeck(decks)?.slug, "real-cheap");
  assert.equal(cheapestPublishableDeck([]), null);
  assert.equal(cheapestPublishableDeck([{ slug: "u", ...costOf(0, 0, 44) }]), null);
});

// ── Structured data ──────────────────────────────────────────────────────────

const FIXTURES: DeckGroupLdInput[] = [
  { slug: "irelia-blade-dancer", name: "Irelia, Blade Dancer", archetype: "Tempo", description: "Benchmark tempo deck.", tier: "1", totalCents: 24_500, pricedCards: 43, priceableCards: 44, imageUrl: "https://riftcompare.com/a.png", metaSharePct: 10, winRatePct: 52, top8s: 15 },
  { slug: "viktor-herald-of-the-arcane", name: "Viktor, Herald of the Arcane", archetype: "Value Midrange", description: "Budget standout.", tier: "3", totalCents: 9_900, pricedCards: 44, priceableCards: 44, imageUrl: "https://riftcompare.com/b.png", metaSharePct: 4, winRatePct: 63, top8s: 9 },
  // Under-covered: real row, unpublishable cost. Must carry no offer anywhere.
  { slug: "thin-data-deck", name: "Thin Data Deck", archetype: "Aggro", description: "Barely resolved.", tier: "3", totalCents: 300, pricedCards: 2, priceableCards: 44, imageUrl: null, winRatePct: 20, top8s: 1 },
];

const optsFor = (c: keyof typeof COUNTRIES) => ({
  siteUrl: "https://riftcompare.com",
  setLabel: "Vendetta",
  metaUpdated: "2026-08-04",
  info: COUNTRIES[c],
});

const AGGRO = deckGroupBySlug("archetype", "aggro")!;

test("ItemList JSON-LD is serialisable and correctly typed", () => {
  const ld = JSON.parse(JSON.stringify(deckGroupItemListLd(AGGRO, FIXTURES, optsFor("AU"))));
  assert.equal(ld["@context"], "https://schema.org");
  assert.equal(ld["@type"], "ItemList");
  assert.equal(ld.numberOfItems, FIXTURES.length);
  assert.equal(ld.itemListElement.length, FIXTURES.length);
  assert.equal(ld.dateModified, "2026-08-04");
  assert.ok(ld.isPartOf["@id"].endsWith("/#website"), "must edge back to the site graph");
  assert.ok(ld.publisher["@id"].endsWith("/#org"));
  ld.itemListElement.forEach((el: Record<string, unknown>, i: number) => {
    assert.equal(el["@type"], "ListItem");
    assert.equal(el.position, i + 1, "positions must be 1-based and contiguous");
    const item = el.item as Record<string, unknown>;
    assert.equal(item["@type"], "Product");
    assert.ok(String(item.name).length > 0);
    assert.match(String(item.url), /^https:\/\/.+\/decks\/.+/);
    assert.ok(String(item.description).length > 0);
  });
});

test("only decks with a publishable cost advertise an offer", () => {
  const ld = deckGroupItemListLd(AGGRO, FIXTURES, optsFor("AU"));
  const items = ld.itemListElement.map((e) => e.item as Record<string, unknown>);
  const withOffers = items.filter((i) => i.offers);
  assert.equal(withOffers.length, 2, "the under-covered deck must not be marked up with a price");
  for (const item of withOffers) {
    const offer = item.offers as Record<string, unknown>;
    // AggregateOffer (lowPrice), not Offer (price): a build cost is a floor
    // across many stores, not one purchasable listing.
    assert.equal(offer["@type"], "AggregateOffer");
    assert.ok("lowPrice" in offer, "AggregateOffer uses lowPrice, not price");
    assert.ok(!("price" in offer), "a single `price` would claim one purchasable listing");
    assert.equal(offer.availability, "https://schema.org/InStock");
    assert.ok(Number(offer.offerCount) > 0);
    assert.ok(Number(offer.lowPrice) > 0, "no offer may quote zero");
  }
});

test("no deck advertises a rating — a win rate is not a review", () => {
  const raw = JSON.stringify(deckGroupItemListLd(AGGRO, FIXTURES, optsFor("AU")));
  for (const banned of ["aggregateRating", "ratingValue", '"review"', "reviewCount"]) {
    assert.ok(!raw.includes(banned), `win rate must never be marked up as a rating (${banned})`);
  }
  // …but it must still be stated as what it is.
  const first = deckGroupItemListLd(AGGRO, FIXTURES, optsFor("AU")).itemListElement[0].item as Record<string, unknown>;
  assert.match(String(first.description), /52% win rate/);
});

test("offer currency and price track the served market, for every market", () => {
  for (const c of COUNTRY_LIST) {
    const ld = deckGroupItemListLd(AGGRO, FIXTURES, optsFor(c.code));
    for (const [i, el] of ld.itemListElement.entries()) {
      const item = el.item as Record<string, unknown>;
      if (!item.offers) continue;
      const offer = item.offers as Record<string, unknown>;
      assert.equal(offer.priceCurrency, c.currency, `${c.code}: offer currency must be ${c.currency}`);
      // The markup price must be the same number the page renders, unformatted.
      const visible = formatMoney(FIXTURES[i].totalCents, c.currency);
      const fromMarkup = formatMoney(Math.round(Number(offer.lowPrice) * 100), c.currency);
      assert.equal(fromMarkup, visible, `${c.code}/${FIXTURES[i].slug}: markup price must equal visible price`);
    }
  }
});

test("no currency is hardcoded in the group builders", () => {
  const src = code("src/lib/deck-group-jsonld.ts");
  for (const iso of ["AUD", "USD", "GBP", "CAD", "SGD", "NZD"]) {
    assert.ok(!src.includes(`"${iso}"`), `deck-group-jsonld must not hardcode ${iso}`);
  }
  assert.match(src, /priceCurrency: o\.info\.currency/, "currency must come from the resolved market");
});

test("FAQPage JSON-LD is correctly typed and mirrors the rendered array", () => {
  const cart = {
    deckName: "Viktor, Herald of the Arcane",
    deckSlug: "viktor-herald-of-the-arcane",
    totalCents: 10_450,
    storeCount: 2,
    topStoreName: "Test Cards",
    matchedCards: 41,
    savedCents: 1_200,
  };
  const faqs = deckGroupFaq(AGGRO, FIXTURES, optsFor("UK"), cart);
  const ld = JSON.parse(JSON.stringify(deckGroupFaqLd(AGGRO, FIXTURES, optsFor("UK"), cart)));
  assert.equal(ld["@type"], "FAQPage");
  assert.equal(ld.mainEntity.length, faqs.length, "markup and rendered array must be the same length");
  for (const [i, q] of ld.mainEntity.entries()) {
    assert.equal(q["@type"], "Question");
    assert.equal(q.acceptedAnswer["@type"], "Answer");
    assert.equal(q.name, faqs[i].q, "markup must quote the rendered question verbatim");
    assert.equal(q.acceptedAnswer.text, faqs[i].a, "markup must quote the rendered answer verbatim");
    assert.ok(String(q.name).trim().endsWith("?"), `question must be a question: ${q.name}`);
    assert.ok(String(q.acceptedAnswer.text).length > 20);
  }
  assert.ok(faqs.length >= 4, `expected >=4 FAQ entries, got ${faqs.length}`);
});

test("FAQ price answers are region-aware and never quote an unpublishable deck", () => {
  for (const c of COUNTRY_LIST) {
    const faqs = deckGroupFaq(AGGRO, FIXTURES, optsFor(c.code));
    const cheapest = faqs.find((q) => q.q.startsWith("What is the cheapest"));
    assert.ok(cheapest, `${c.code}: cheapest question must exist`);
    assert.ok(
      cheapest!.a.includes(formatMoney(9_900, c.currency)),
      `${c.code}: must quote the cheapest publishable deck — got ${cheapest!.a}`,
    );
    // The 300-cent under-covered fixture must never surface as "the cheapest".
    assert.ok(!cheapest!.a.includes("Thin Data Deck"), `${c.code}: quoted a deck with unpublishable data`);
    assert.ok(!/\b0\.00\b/.test(cheapest!.a), `${c.code}: quoted a zero price`);
  }
});

test("the FAQ omits, rather than fakes, answers it has no data for", () => {
  const unpriced: DeckGroupLdInput[] = [
    { slug: "a", name: "A", archetype: "Aggro", description: "d", tier: "3", totalCents: 0, pricedCards: 0, priceableCards: 44, imageUrl: null },
    { slug: "b", name: "B", archetype: "Aggro", description: "d", tier: "3", totalCents: 0, pricedCards: 0, priceableCards: 44, imageUrl: null },
  ];
  const faqs = deckGroupFaq(AGGRO, unpriced, optsFor("US"));
  assert.ok(!faqs.some((q) => /cost to build|cheapest/i.test(q.q)), "no price question without price data");
  assert.ok(faqs.length >= 1, "the count question is always answerable");
  const ld = deckGroupFaqLd(AGGRO, unpriced, optsFor("US"));
  assert.ok(ld && (ld as { mainEntity: unknown[] }).mainEntity.length === faqs.length);
});

// ── Indexability hygiene, asserted against the route source ──────────────────

for (const [route, label] of [[ARCHETYPE_ROUTE, "archetype"], [DOMAIN_ROUTE, "domain"]] as const) {
  test(`${label} route declares a self-referencing canonical and no fabricated hreflang`, () => {
    const src = code(route);
    assert.match(src, /alternates: pageAlternates\(path\)/, `${label}: canonical must come from the group's own path`);
    // Region is a cookie on ONE url set; per-locale alternates would point at
    // URLs that don't exist, which is worse than declaring none.
    assert.ok(!/languages:\s*\{/.test(src), `${label}: no per-locale alternates on a cookie-driven URL`);
    assert.ok(!/hreflang/i.test(src), `${label}: no hreflang until region-segmented URLs exist`);
  });

  test(`${label} route noindexes exactly the groups the sitemap withholds`, () => {
    const src = code(route);
    assert.match(
      src,
      /deckGroupIsIndexable\(group\) \? \{\} : \{ robots: \{ index: false, follow: true \} \}/,
      `${label}: thin groups must be noindex,follow`,
    );
    // follow, never nofollow: the page is hidden from the index, not cut out of
    // the link graph.
    assert.ok(!/follow: false/.test(src), `${label}: must not strip follow`);
  });

  test(`${label} route 404s a group with no real deck`, () => {
    const src = code(route);
    assert.match(src, /seedsInGroup\(group\)\.length === 0\) notFound\(\)/, `${label}: empty group must 404`);
    assert.match(src, /seedsInGroup\(group\)\.length === 0\) return notFoundMetadata/, `${label}: 404 metadata`);
  });

  test(`${label} route emits ItemList and FAQ structured data`, () => {
    const src = read(route);
    assert.ok(src.includes("deckGroupItemListLd"), `${label}: must emit ItemList`);
    assert.ok(src.includes("deckGroupFaqLd"), `${label}: must emit FAQPage`);
    assert.ok(src.includes("application/ld+json"), `${label}: must render the LD script`);
    // One source for markup and visible copy.
    assert.match(src, /const faqs = deckGroupFaq\(/, `${label}: the visible FAQ must be the marked-up array`);
    assert.match(src, /faqs=\{faqs\}/, `${label}: the array must be passed to the view`);
  });
}

test("the shared view renders the same FAQ array it is handed, and no orphan prices", () => {
  const src = read("src/components/DeckGroupView.tsx");
  assert.match(src, /<HubFaq faqs=\{faqs\}/, "the visible FAQ must render the passed array");
  // Every money figure on the page goes through the verdict, never through a raw
  // totalCents. This is the assertion that stops a "from $0.00" regression.
  assert.ok(
    !/formatMoney\(\s*d\.totalCents/.test(src),
    "build costs must be rendered from deckCostVerdict, never straight from totalCents",
  );
  assert.match(src, /deckCostVerdict\(d\)/, "each deck card must consult the verdict");
  assert.match(src, /not enough listings/, "an unpublishable cost must say so rather than show a number");
});

test("the view never links to a group that 404s", () => {
  // Caught in a live crawl: the sibling nav was built from DECK_GROUPS, so every
  // domain page shipped a link to /decks/domain/colorless — a group with no real
  // deck, which the route correctly 404s. A broken internal link on 6 pages is
  // wasted crawl budget and a dead end for readers.
  const src = code("src/components/DeckGroupView.tsx");
  assert.match(src, /liveDeckGroups\(\)\.filter/, "siblings must come from liveDeckGroups(), not DECK_GROUPS");
  assert.ok(!/DECK_GROUPS\.filter/.test(src), "DECK_GROUPS includes groups that 404 — never link them");
  // And the same rule on the hub band.
  assert.ok(
    !/DECK_GROUPS\b/.test(code("src/app/decks/page.tsx")),
    "/decks must link liveDeckGroups(), never the full list",
  );
  // Belt and braces on the data itself: nothing linkable may be dead.
  for (const g of liveDeckGroups()) assert.ok(seedsInGroup(g).length > 0, `${deckGroupPath(g)} is linked but dead`);
});

test("every image in the generated view has descriptive alt text", () => {
  const src = read("src/components/DeckGroupView.tsx");
  const imgs = src.match(/<img[\s\S]{0,400}?\/>/g) ?? [];
  assert.ok(imgs.length > 0, "expected at least the deck art image");
  for (const img of imgs) {
    assert.match(img, /alt=\{/, "every <img> needs alt");
    assert.ok(!/alt=""/.test(img), "deck art is meaningful, not decorative");
  }
});

test("the generated pages are internally linked from a hub", () => {
  // An indexable page nothing links to is discovered late and trusted little.
  const decks = read("src/app/decks/page.tsx");
  assert.ok(decks.includes("deckGroupPath(g)"), "/decks must link every live group");
  assert.ok(decks.includes("liveDeckGroups()"), "/decks must derive the band from the live groups");
  // …and cross-linked from the two taxonomies they sit between.
  assert.ok(
    read("src/app/champions/[slug]/page.tsx").includes("deckGroupPath("),
    "champion hubs must link the archetype/domain shelves their decks belong to",
  );
  assert.ok(
    read("src/app/domains/[slug]/page.tsx").includes("deckGroupPath("),
    "domain card pages must link their deck counterpart",
  );
});

// ── Sitemap ──────────────────────────────────────────────────────────────────

test("the deck-group section exists in the sitemap index", () => {
  assert.ok(SECTIONS.includes("deck-groups" as never), "SECTIONS must carry the new child sitemap");
  const src = read("src/lib/sitemap-sections.ts");
  assert.match(src, /async function deckGroups\(\)/, "a builder must exist for the section");
  assert.match(src, /"deck-groups": deckGroups/, "the builder must be wired into BUILDERS");
  assert.match(src, /indexableDeckGroups\(\)/, "the section must use the same predicate as the pages' robots tag");
  assert.match(src, /lastModified: day/, "entries need a real lastmod");
});

test("the sitemap submits exactly the indexable groups — never a noindexed URL", () => {
  // The contradiction this prevents is "Submitted URL marked 'noindex'": a URL
  // in the sitemap that the page itself tells Google to drop.
  const submitted = indexableDeckGroups();
  for (const g of submitted) {
    assert.ok(deckGroupIsIndexable(g), `${deckGroupPath(g)} is submitted but not indexable`);
  }
  for (const g of DECK_GROUPS) {
    if (deckGroupIsIndexable(g)) continue;
    assert.ok(!submitted.includes(g), `${deckGroupPath(g)} is noindexed but submitted`);
  }
  // And the paths are the ones the routes actually serve.
  for (const g of submitted) {
    assert.match(deckGroupPath(g), /^\/decks\/(archetype|domain)\/[a-z0-9-]+$/);
  }
});

test("robots.txt picks the new child sitemap up automatically", () => {
  const src = read("src/app/robots.ts");
  assert.match(src, /SECTIONS\.map\(\(id\) => `\$\{SITE_URL\}\/sitemaps\/\$\{id\}\.xml`\)/);
});

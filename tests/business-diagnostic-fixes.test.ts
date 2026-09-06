import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normaliseCondition, CONDITIONS } from "../src/lib/constants";
import { isPaidLink } from "../src/lib/affiliate";
import type { Deal } from "../src/lib/top-deals";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
// Comments are stripped before assertions that check something is ABSENT — the
// commit messages/doc comments in this codebase routinely explain what used to
// be there and why it was removed, which would otherwise trip a naive
// doesNotMatch on the removed thing's own name.
//
// Line comments MUST be stripped BEFORE block comments: at least one existing
// // comment in this codebase contains a literal "/*"-shaped substring (a
// "/card/*" URL pattern in prose), and stripping block comments first treats
// that as a real block-comment OPEN, then greedily eats everything up to the
// next unrelated "*/" anywhere later in the file — silently deleting hundreds
// of real lines, including the very code a test meant to assert on.
const readCode = (p: string) => read(p).replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, "");

// ─────────────────────────────────────────────────────────────────────────────
// Top Deals badge — the "second number" must be a labelled reference price,
// never an unlabelled delta that can exceed the headline price.
// ─────────────────────────────────────────────────────────────────────────────
// A professional business audit misread "US$358.71" (current price) next to
// "US$713.92 · −67%" (the unlabelled dollar amount dropped) as a before→after
// price PAIR implying the price rose — because for any drop over 50%, the
// delta genuinely is larger than the current price. The fix isn't the math
// (it always reconciled), it's showing the actual reference price instead.

test("the homepage deal badge is a plain percentage, not a 'was $X' reference price", () => {
  // Superseded by a homepage-declutter pass: the badge used to read "was
  // US$1,167.94 · Save 14%" specifically to stop the two numbers on a row
  // being misread as a before→after price pair. That fix was correct but
  // added a second dollar figure to a row that's supposed to be readable at
  // a glance — the percentage alone answers "how big a deal is this," and
  // the exact reference price is one click away via QuickView. See
  // TodaysTopDeals.tsx's PctBadge for the current reasoning.
  const src = readCode("src/components/TodaysTopDeals.tsx");
  const badgeAt = src.indexOf("function PctBadge");
  assert.ok(badgeAt >= 0, "expected the PctBadge component");
  const body = src.slice(badgeAt, badgeAt + 500);
  assert.doesNotMatch(body, /was \$/, 'the badge must not render a "was $X" reference price');
  assert.doesNotMatch(body, /deal\.refCents/, "the badge must not read refCents at all — it's a plain percentage now");
  assert.match(body, /Save \$\{deal\.pctLabel\}%/, "savings-vs-market must still show its percentage");
});

test("every Deal-producing branch in top-deals.ts still populates refCents (kept for other consumers), and undervalued is gone", () => {
  const src = readCode("src/lib/top-deals.ts");
  const refCentsAssignments = (src.match(/refCents:/g) ?? []).length;
  // One in the type definition + one per dealType branch (savings-vs-market,
  // price-drops, cheapest-sealed, rising-cards) = 5. "undervalued" was removed
  // from this feed entirely — see the file's own header comment — so this is
  // 5, not 6.
  assert.equal(refCentsAssignments, 5, "expected refCents declared once and populated in all four remaining deal branches");
  assert.doesNotMatch(src, /dealType:\s*"undervalued"/, "the undervalued column must be gone from this feed's code, not just hidden in the UI");
  assert.doesNotMatch(src, /getUndervalued\(/, "top-deals.ts must no longer fetch it at all, per its own header comment");
});

// ─────────────────────────────────────────────────────────────────────────────
// Ranking-methodology copy must describe the ACTUAL sort, not an aspirational one.
// ─────────────────────────────────────────────────────────────────────────────
// editorial-policy and stores/tracked both published "ranks by total delivered
// cost" while market-rows.ts sorts by item price with delivered cost only
// breaking ties — a real, deliberate design choice (a store isn't penalised for
// having KNOWN postage when a competitor's is unknown), but the copy claimed
// the opposite. Fixed the copy to match the code, not the other way around —
// changing the sort has a much larger, largely untested blast radius across
// every card page and its structured data.

test("the actual sort in market-rows.ts ranks by item price, postage breaking ties", () => {
  const src = read("src/lib/market-rows.ts");
  assert.match(
    src,
    /\.sort\(\(a, b\) => a\.priceCents - b\.priceCents \|\| a\.delivered - b\.delivered\)/,
    "computeMarket's sort changed — re-verify the published ranking copy still matches it"
  );
});

test("editorial-policy and stores/tracked no longer overclaim delivered-cost ranking", () => {
  for (const p of ["src/app/editorial-policy/page.tsx", "src/app/stores/tracked/page.tsx"]) {
    const src = read(p);
    assert.doesNotMatch(
      src,
      /ranks? (stores )?by total delivered cost/i,
      `${p} must not claim delivered-cost is the PRIMARY ranking key — it only breaks ties`
    );
    assert.match(src, /item price/, `${p} should describe item price as the primary rank`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Per-link "Paid link" disclosure — only where the link is ACTUALLY monetised.
// ─────────────────────────────────────────────────────────────────────────────

test("isPaidLink is true for eBay/Amazon/TCGplayer hosts and false for a plain store URL", () => {
  assert.equal(isPaidLink("https://www.ebay.com.au/itm/123?campid=X"), true);
  assert.equal(isPaidLink("https://www.amazon.com/dp/B0X?tag=riftcompare-20"), true);
  assert.equal(isPaidLink("https://partner.tcgplayer.com/c/123?u=..."), true);
  assert.equal(
    isPaidLink("https://cherrycollectables.com.au/products/some-card"),
    false,
    "DIRECT_PROGRAMS is empty today — an unsigned Shopify store link must not claim to be paid"
  );
  assert.equal(isPaidLink(null), false);
  assert.equal(isPaidLink(undefined), false);
  assert.equal(isPaidLink("not a url"), false);
});

test("the per-link tag is gated on isPaidLink, not rendered unconditionally", () => {
  for (const p of ["src/components/CardMarketSection.tsx", "src/components/QuickView.tsx"]) {
    const src = read(p);
    assert.match(src, /isPaidLink\(/, `${p} must gate PaidLinkTag on isPaidLink()`);
    assert.match(src, /PaidLinkTag/, `${p} must render PaidLinkTag`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Condition normalisation — never guess; an eBay "Used" must not become "NM".
// ─────────────────────────────────────────────────────────────────────────────

test("normaliseCondition maps known TCG-scale wording correctly", () => {
  assert.equal(normaliseCondition("Near Mint"), "NM");
  assert.equal(normaliseCondition("NM"), "NM");
  assert.equal(normaliseCondition("Lightly Played"), "LP");
  assert.equal(normaliseCondition("LP"), "LP");
  assert.equal(normaliseCondition("Moderately Played"), "MP");
  assert.equal(normaliseCondition("Heavily Played"), "HP");
  assert.equal(normaliseCondition("Damaged"), "DMG");
});

test("normaliseCondition maps eBay's own raw-card scale by rank, not by TCG wording", () => {
  assert.equal(normaliseCondition("Near Mint or Better"), "NM");
  assert.equal(normaliseCondition("Excellent"), "LP");
  assert.equal(normaliseCondition("Very Good"), "MP");
  assert.equal(normaliseCondition("Poor"), "HP");
});

test("normaliseCondition refuses to guess on unrecognised or absent input", () => {
  assert.equal(normaliseCondition(null), null);
  assert.equal(normaliseCondition(undefined), null);
  assert.equal(normaliseCondition(""), null);
  assert.equal(normaliseCondition("Default Title"), null);
  assert.equal(
    normaliseCondition("Used"),
    null,
    "eBay's generic 'Used' item-condition string is not a TCG grade — must not silently become NM"
  );
});

test("every normaliseCondition return value is a real key in CONDITIONS", () => {
  const samples = ["Near Mint", "Lightly Played", "Moderately Played", "Heavily Played", "Damaged", "Excellent", "Very Good", "Poor", "Brand New"];
  for (const s of samples) {
    const g = normaliseCondition(s);
    if (g != null) assert.ok(CONDITIONS[g], `normaliseCondition("${s}") returned "${g}", which is not in CONDITIONS`);
  }
});

test("the card page's narrative NM/played split uses the shared normaliser, not a page-local regex", () => {
  const src = read("src/app/card/[id]/page.tsx");
  assert.match(
    src,
    /normaliseCondition\(p\.condition\) === "NM"/,
    "the About-narrative condition split must go through normaliseCondition so it can't drift from the price table's own labelling"
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Methodology page — registered everywhere a static page must be, or the build
// throws (staticPageDateLabel) or the page is an orphan (no sitemap/no nav link).
// ─────────────────────────────────────────────────────────────────────────────

test("methodology page is registered in static-page-dates, sitemap and nav", () => {
  assert.match(read("src/lib/static-page-dates.ts"), /"\/methodology":/, "staticPageDateLabel throws without this entry");
  assert.match(read("src/lib/sitemap-sections.ts"), /\/methodology/, "the page must be submitted in the sitemap");
  assert.match(read("src/components/nav-groups.ts"), /href: "\/methodology"/, "the page must be reachable from the mega-menu/footer");
  assert.match(read("src/app/layout.tsx"), /href="\/methodology"/, "the page must be linked from the global footer");
});

test("methodology page states the condition mapping and FX policy", () => {
  const src = read("src/app/methodology/page.tsx");
  assert.match(src, /condition/i);
  assert.match(src, /USD_TO/, "FX table must come from the real lib/fx.ts source, not a hand-copied literal");
});

// ─────────────────────────────────────────────────────────────────────────────
// Navbar — the peer-to-peer marketplace removed entirely (2026-08): no
// buy-chip, no routes, no nav gate.
// ─────────────────────────────────────────────────────────────────────────────

test("Best Basket is NOT a header-level Navbar link", () => {
  // Was a first-class header link while Best Basket was a free-account tool —
  // removed when it moved back to Premium (see lib/premium.ts's tier note): a
  // header slot is for something every visitor can act on immediately, not a
  // tool most visitors would bounce off a paywall for. Still reachable via
  // nav-groups.ts (the launcher, mega-menu, /tools) and its own contextual
  // links, so this only pins the header specifically.
  assert.doesNotMatch(read("src/components/Navbar.tsx"), /href="\/tools\/best-basket"/);
});

test("the marketplace buy-chip is gone from the primary Navbar", () => {
  const code = readCode("src/components/Navbar.tsx");
  assert.doesNotMatch(
    code,
    /MARKETPLACE_NAV_VISIBLE/,
    "the Navbar-level marketplace gate (import or usage) should be fully removed, not just left unused"
  );
  assert.doesNotMatch(code, /aria-label="Marketplace"/, "the marketplace chip markup must be gone");
});

test("the marketplace routes are fully removed", () => {
  // The P2P marketplace was killed entirely — every route under /marketplace
  // must 404, so none of its page files may survive in the tree.
  for (const p of [
    "src/app/marketplace/page.tsx",
    "src/app/marketplace/orders/page.tsx",
    "src/app/marketplace/funds/page.tsx",
    "src/app/marketplace/sell/page.tsx",
  ]) {
    assert.throws(() => readFileSync(join(ROOT, p), "utf8"), `${p} must be gone — the marketplace was removed`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Homepage — US-first hero, Best Basket promo section, reconciled stat claims.
// ─────────────────────────────────────────────────────────────────────────────

test("the hero H1 leads with the US by default, not an alphabetised six-market list", () => {
  const src = read("src/components/home/CinematicHero.tsx");
  // heroAdjective defaults to "US" when no `region` prop is passed — i.e. the
  // real homepage, unchanged. Region pages (/au, /uk, /sg, /ca) override
  // it via the region prop — see components/home/RegionHome.tsx.
  assert.match(src, /heroAdjective = region\?\.adjective \?\? "US"/);
  assert.match(src, /across every \{heroAdjective\} store/);
  assert.doesNotMatch(
    src,
    /AU, US, UK, SG/,
    "the old market-list H1 string must be gone — the markets are now named in the subhead instead"
  );
});

test("the hero's primary CTA row still carries only one <Link> (test constraint from internal-linking.test.ts)", () => {
  // Re-derived after the homepage-redesign brief's own hero rebuild collapsed
  // this row further — see tests/internal-linking.test.ts's "the hero carries
  // exactly one secondary text link, not a wall of CTAs" for the real,
  // maintained invariant this duplicates a narrower check of.
  const src = read("src/components/home/CinematicHero.tsx");
  const row = /flex flex-col items-center gap-2[\s\S]*?<\/div>/.exec(src);
  assert.ok(row, "the primary CTA row markup moved — re-derive this test");
  const linkCount = (row[0].match(/<Link/g) ?? []).length;
  assert.ok(linkCount <= 2, `the CTA row has ${linkCount} <Link>s — tests/internal-linking.test.ts caps it at 2`);
});

test("Best Basket has a homepage section with a real crawlable Link", () => {
  // Moved into HomeSections.tsx (shared with the 5 region home pages) when
  // the homepage's feature sections were factored out — see that file's own
  // header comment.
  const src = read("src/components/home/HomeSections.tsx");
  assert.match(src, /href="\/tools\/best-basket"/);
});

test("the /stores pitch page counts real tracked stores (RETAILER_LIST), not every distinct retailer key ever seen", () => {
  const src = read("src/app/stores/page.tsx");
  assert.match(src, /RETAILER_LIST\.length/, "store count must use the same source of truth as /stores/tracked");
  assert.doesNotMatch(
    src,
    /retailerPrice\.groupBy\(\{ by: \["retailer"\] \}\)/,
    "the old unfiltered groupBy counted eBay/marketguide/TCGplayer pseudo-retailers and stale removed stores as real stores"
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Card page internal linking — cross-market table, tools strip, cheaper
// alternatives, played-alongside, all server-rendered (crawlable).
// ─────────────────────────────────────────────────────────────────────────────

test("the card page links to the deck builder, Best Basket and bulk pricer", () => {
  const src = read("src/app/card/[id]/page.tsx");
  assert.match(src, /href="\/deck"/);
  assert.match(src, /href="\/tools\/best-basket"/);
  assert.match(src, /href="\/bulk-pricer"/);
});

test("the card page's cheaper-alternatives query is gated on a real priced baseline", () => {
  const src = read("src/app/card/[id]/page.tsx");
  assert.match(
    src,
    /baseline\.lowest != null\s*\n\s*\?\s*await prisma\.card\.findMany/,
    "cheaperAlternatives must never run/render for an unpriced card"
  );
});

test("the card page derives 'played alongside' from the SAME meta-deck data as 'played in these decks', not a second lookup", () => {
  const src = read("src/app/card/[id]/page.tsx");
  const coPlaySection = src.slice(src.indexOf("coPlayCounts"), src.indexOf("coPlayCounts") + 600);
  assert.match(coPlaySection, /allRelatedDecks/, "co-occurrence must be derived from allRelatedDecks, not a new static/DB lookup");
  assert.match(coPlaySection, /section === "rune"/, "runes are a mana-base choice, not synergy — must be excluded");
});

test("'played alongside' dedupes multi-print card names before rendering, so one champion can't occupy two slots", () => {
  // A champion/legend name routinely has several printings (base, Showcase,
  // Signature, alt-art) sharing one nameNormalized with no unique constraint —
  // a raw findMany over 12 co-play NAMES can return more than 12 ROWS. Without
  // a dedup step, take:12 can silently fill with several prints of one
  // champion while dropping a genuinely different ranked synergy card, so
  // "Often played with X" would show the same card twice under a subhead
  // promising OTHER cards. Pinned against a real, confirmed regression a
  // pre-production review caught with real catalogue data (verified: cards
  // co-played with a 4-print champion in the seeded meta decks return 13-18
  // candidate rows for 12 names).
  const code = readCode("src/app/card/[id]/page.tsx");
  const at = code.indexOf("const coPlayNames");
  const section = code.slice(at, code.indexOf("const playedAlongside =", at) + 400);
  assert.match(
    section,
    /playedAlongsideByName/,
    "the resolved rows must be deduped by normalised name into a Map before rendering"
  );
  assert.doesNotMatch(
    section,
    /take:\s*12/,
    "a bare take:12 on the ROW query is exactly the bug — the cap belongs on the deduped NAME list (already applied via coPlayNames.slice(0, 12)), not on raw rows that can include several prints per name"
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Deck → Best Basket handoff.
// ─────────────────────────────────────────────────────────────────────────────

test("decks/[slug] builds a bestBasketHref and DeckView renders it", () => {
  assert.match(read("src/app/decks/[slug]/page.tsx"), /bestBasketHref/);
  assert.match(read("src/components/DeckView.tsx"), /bestBasketHref/);
});

test("BestBasket accepts an initialList and best-basket/page.tsx decodes ?list=", () => {
  assert.match(read("src/components/BestBasket.tsx"), /initialList/);
  assert.match(read("src/app/tools/best-basket/page.tsx"), /searchParams\.list/);
});

test("the signed-out gate preserves ?list= through the login redirect", () => {
  const src = read("src/app/tools/best-basket/page.tsx");
  assert.match(
    src,
    /searchParams\.list \? `\/tools\/best-basket\?list=\$\{searchParams\.list\}`/,
    "a signed-out visitor who followed a deck's Best-Basket link must not lose that list after signing in"
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// GA4 key event.
// ─────────────────────────────────────────────────────────────────────────────

test("OutboundLink fires a GA4 buy_click event (enriched with optional card/price fields) alongside the existing Vercel Analytics one", () => {
  // Both calls now live in the shared trackEvent() helper (lib/analytics.ts) —
  // see tests/analytics-events.test.ts for the helper's own guarantees.
  //
  // Reconciled with an independent pass (the homepage-redesign brief) that
  // built a second, richer event (`store_click`, with card_id/card_name/
  // price/position_in_list/page_type) for the exact same click. Kept this
  // event's name — already live, already the subject of GA4 key-event
  // planning — and folded the richer fields in as enrichment rather than
  // firing two events per click. See DECISIONS.md's merge-reconciliation
  // section.
  const src = read("src/components/OutboundLink.tsx");
  assert.match(src, /trackEvent\("buy_click", \{/);
  assert.match(src, /retailer,\s*\n\s*country,\s*\n\s*kind,/);
  for (const field of ["card_id: cardId", "card_name: cardName", "price,", "position_in_list: positionInList", "page_type: pageType"]) {
    assert.ok(src.includes(field), `expected OutboundLink's buy_click call to include ${field}`);
  }
  const helper = read("src/lib/analytics.ts");
  assert.match(helper, /vercelTrack\(name, cleaned\)/, "the existing Vercel Analytics event must still fire too");
  assert.match(helper, /window\.gtag\?\.\("event", name, cleaned\)/, "and the GA4 mirror");
});

// ─────────────────────────────────────────────────────────────────────────────
// Store data-health monitor — every piece ships inert until the table exists.
// ─────────────────────────────────────────────────────────────────────────────

test("StoreHealthSnapshot is purely additive: cuid id, unique+index, no required relation", () => {
  const schema = read("prisma/schema.prisma");
  const at = schema.indexOf("model StoreHealthSnapshot");
  assert.ok(at >= 0, "StoreHealthSnapshot model not found");
  const body = schema.slice(at, schema.indexOf("\n}", at));
  assert.match(body, /@@unique\(\[retailer, country, day\]\)/, "same-day re-run must be idempotent");
  assert.doesNotMatch(body, /@relation/, "must not require a Card/User relation — retailer is an unconstrained String key, same as RetailerPrice.retailer");
});

test("checkStoreHealth and its Discord poster are both guarded to fail soft", () => {
  const health = read("src/lib/store-health.ts");
  assert.match(health, /catch \(e\)/);
  assert.match(health, /console\.warn/, "must degrade quietly, not throw, when the table doesn't exist yet");

  const discord = read("src/lib/discord.ts");
  assert.match(discord, /export async function postDiscordAlert/);
  assert.match(discord, /if \(!webhook\) return \{ ok: false/, "must no-op, not throw, when DISCORD_WEBHOOK_URL is unset");
});

test("store health computes today's median price via a SQL aggregate, not a whole-table findMany", () => {
  // A pre-production review caught the original version pulling every in-stock
  // RetailerPrice row (tens of thousands, across all 142 tracked stores) into
  // Node on every invocation — twice a day via cron, plus every 5 minutes the
  // admin page is viewed after its cache expires. lib/db.ts documents this
  // exact shape ("whole-table reads ... never in request handlers") as the
  // cause of five separate exhausted Neon transfer allowances. Fixed by
  // computing the median IN Postgres (percentile_cont), so only one row per
  // store/market crosses the wire instead of one row per LISTING.
  const src = read("src/lib/store-health.ts");
  assert.match(src, /percentile_cont/, "the median must be computed in SQL, not by pulling raw prices into Node");
  assert.match(src, /\$queryRaw/, "expected a raw query for the per-store median aggregate");
  assert.doesNotMatch(
    src,
    /retailerPrice\.findMany\(\{\s*where:\s*\{\s*retailer:\s*\{\s*in:\s*trackedKeys\s*\},\s*inStock:\s*true\s*\}/,
    "must not fetch every in-stock row across all tracked stores with no row cap"
  );
});

test("the store-health cron route fails CLOSED with no CRON_SECRET", () => {
  const src = read("src/app/api/cron/store-health/route.ts");
  assert.match(src, /if \(!secret\) return false;/, "an unset secret must deny every request, not fail open");
});

test("the store-health GitHub workflow schedules after the price-import runs and fails loudly with no CRON_SECRET", () => {
  const src = read(".github/workflows/store-health.yml");
  assert.match(src, /cron: "0 8,20 \* \* \*"/);
  assert.match(src, /::error::No CRON_SECRET secret set/);
});

test("store health only posts to Discord when there are alerts, never a daily all-clear", () => {
  const src = read("src/app/api/cron/store-health/route.ts");
  assert.match(src, /if \(alerts\.length\)/, "a clean run should stay silent, not compete for attention with a daily message");
});

// ─────────────────────────────────────────────────────────────────────────────
// THE BLIND SPOT AT THE CENTRE OF THE STORE MONITOR.
//
// checkStoreHealth() exists to catch a silently broken scraper. It used to build
// its report by iterating `counts` — a groupBy over RetailerPrice — so a store
// that returned ZERO rows produced no group, never entered the loop, and got no
// row and no alert.
//
// That is the most complete form of the failure it is built to detect. Every
// other check needs data to fire: `stale` reads a lastSeen that is null with no
// rows, `listings-dropped` needs a count to compare against, and both price
// checks need a median. A scraper falling from 400 listings to 40 alerted
// loudly; the same scraper falling to 0 — site redesign, new bot protection,
// changed URL, expired token — vanished from the report, which reads exactly
// like "this store was never configured".
//
// The loop must therefore walk the REGISTRY, not the query result.
// ─────────────────────────────────────────────────────────────────────────────
test("store health reports stores that returned NOTHING, not just stores with data", () => {
  const src = read("src/lib/store-health.ts");

  // Matches the BLOCK form only. The union line below is `for (const c of
  // counts) expected.set(...)` on one line and is required, so a bare
  // /for \(const c of counts\)/ would fail on correct code — the same
  // over-broad-negative mistake this file has caught before.
  assert.doesNotMatch(
    src,
    /for \(const c of counts\)\s*\{/,
    "iterating the groupBy as the report loop makes a zero-listing store invisible — walk the registry instead"
  );
  assert.match(
    src,
    /for \(const r of RETAILER_LIST\)/,
    "the expected set must be built from the registry of stores we claim to track"
  );
  // Observed markets must be UNIONED in, never replaced: eBay uses per-market
  // retailer keys, so a registry-only list would drop real rows from the report.
  assert.match(
    src,
    /for \(const c of counts\) expected\.set\(/,
    "markets that returned rows but aren't named in the registry must still be reported"
  );
  // And the zero case has to actually raise something.
  assert.match(src, /kind: "no-listings"/, "a store with no rows at all must raise an alert");
  assert.match(
    src,
    /"no-listings":\s*"[^"]+"/,
    "the new alert kind needs a KIND_LABEL or the Discord line renders undefined"
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Cardmarket must be MONITORED even though it must never be SCRAPED as a store.
// ─────────────────────────────────────────────────────────────────────────────
// Found 2026-09-06: the exact "no-listings" failure mode above (a source
// silently going to zero rows) happened to Cardmarket for days with no alert,
// because store-health.ts's registry was built ONLY from RETAILER_LIST, which
// deliberately excludes Cardmarket (see lib/store-pages.ts's own note on why —
// it must never get a scraped-store page or enter the generic Shopify/Woo scrape
// loop). REFERENCE_SOURCES (lib/constants.ts) is the fix: a second, separate
// registry folded into the same monitor without touching RETAILER_LIST itself.
test("Cardmarket is folded into the store-health registry, without joining RETAILER_LIST", () => {
  const src = read("src/lib/store-health.ts");
  assert.match(src, /REFERENCE_SOURCES/, "store-health.ts must import and use REFERENCE_SOURCES");
  assert.match(
    src,
    /for \(const r of REFERENCE_SOURCES\)/,
    "REFERENCE_SOURCES must be folded into the expected-registry loop, same as RETAILER_LIST"
  );

  const retailers = read("src/lib/retailers.ts");
  assert.doesNotMatch(
    retailers,
    /key:\s*"cardmarket/i,
    "Cardmarket must stay OUT of retailers.ts's RETAILER_LIST — that registry drives the real-store scrape loop and per-store pages " +
      "(prose mentioning Cardmarket, e.g. explaining why EU has few stores, is fine — only a REGISTRY ENTRY is the problem)"
  );

  const constants = read("src/lib/constants.ts");
  assert.match(constants, /export const REFERENCE_SOURCES/, "REFERENCE_SOURCES must be defined in constants.ts");
  assert.match(constants, /CARDMARKET_RETAILER/, "REFERENCE_SOURCES must include the UK Cardmarket key");
  assert.match(constants, /CARDMARKET_EU_RETAILER/, "REFERENCE_SOURCES must include the EU Cardmarket key");
});

test("the public stores directory lists Cardmarket separately from the real-store grid/count", () => {
  const src = read("src/app/stores/tracked/page.tsx");
  assert.match(src, /REFERENCE_SOURCES/, "/stores/tracked must import REFERENCE_SOURCES");
  assert.match(
    src,
    /Reference/i,
    "the reference-sources section must be visibly labelled as distinct from the real-store grid"
  );
  // The real-store count (`total`) must stay computed from RETAILER_LIST alone —
  // folding REFERENCE_SOURCES into it would silently reinflate the "N stores"
  // claim the file's own comment (see /stores page) already fixed once before.
  assert.match(src, /const total = RETAILER_LIST\.length/, "the tracked-store total must not include reference sources");
});

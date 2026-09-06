import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isPromoProduct, type TcgProduct } from "../src/lib/tcgplayer";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const readCode = (p: string) => read(p).replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, "");

// ─────────────────────────────────────────────────────────────────────────────
// Reported directly: "the box ev calc is severely wrong. the rare cards are
// severely overpriced". Root cause traced on live production: TCGplayer's
// "Riftbound Organized Play Promotional Cards" set sells event-exclusive metal
// reprints — e.g. a metal "Ahri, Nine-Tailed Fox" (Prize Wall / Best Of) — that
// carry the SAME collector number as the real booster-pack card ("255/298"),
// because physically they depict the same card. buildTcgplayerRows() matched
// products to cards by set+number alone, so the metal promo resolved to the
// exact same cardId as the real card — and since two products colliding on one
// key keeps whichever has the HIGHER market price (a rule built for the
// English-vs-Chinese-duplicate case, see the file's own header comment), the
// promo's four-figure metal-card price overwrote the real card's every time:
// Ahri, Nine-Tailed Fox (OGN 255/298) showed US$4,424.74 on /tools/box-ev
// against a real cheapest-store price of US$2.62; Teemo, Swift Scout (OGN
// 263/298) showed US$4,400.00 against a real US$0.34. Averaged into the
// "Rare" pool across a whole set, a handful of these is exactly what turns a
// calculator's rare-tier average "severely" wrong rather than a rounding blip.
// ─────────────────────────────────────────────────────────────────────────────

const mkProduct = (setName: string, productName = "Some Card"): TcgProduct => ({
  productId: 1,
  productName,
  productUrlName: "some-card",
  setUrlName: "some-set",
  productLineUrlName: "riftbound-league-of-legends-trading-card-game",
  setName,
  marketPrice: null,
  lowestPrice: null,
  foilOnly: false,
  sealed: false,
});

test("isPromoProduct flags TCGplayer's Organized Play Promotional Cards set", () => {
  assert.ok(isPromoProduct(mkProduct("Riftbound Organized Play Promotional Cards")));
  assert.ok(isPromoProduct(mkProduct("Organized Play Promotional Cards")));
  // Case-insensitive and tolerant of the exact spacing TCGplayer might use.
  assert.ok(isPromoProduct(mkProduct("riftbound organized  play promotional cards")));
});

test("isPromoProduct leaves every real set name alone", () => {
  for (const setName of ["Origins", "Spiritforged", "Unleashed", "Proving Grounds", "Vendetta", "Radiance"]) {
    assert.equal(isPromoProduct(mkProduct(setName)), false, `${setName} must not be flagged as a promo product`);
  }
});

test(
  "buildTcgplayerRows() never resolves a promo product via set+number — only an explicit externalId link",
  () => {
    const src = readCode("src/lib/tcgplayer.ts");
    const scAt = src.indexOf("const sc = isPromoProduct(p) ? null : setFromTotal(total);");
    assert.ok(
      scAt >= 0,
      "expected the set+number match to be gated behind isPromoProduct(p), same treatment as the set-less rune fallback a few lines below",
    );
  },
);

test("the promo-collision fix landed BEFORE the higher-price-wins collision rule, not after", () => {
  // Order matters: if isPromoProduct() were checked after `best.set(...)` already
  // ran, the promo's price would already have clobbered the real card's by the
  // time anyone looked at it.
  const src = readCode("src/lib/tcgplayer.ts");
  const scAt = src.indexOf("const sc = isPromoProduct(p)");
  const bestSetAt = src.indexOf("if (!prev || marketForCompare > prev.market) best.set(");
  assert.ok(scAt >= 0 && bestSetAt >= 0 && scAt < bestSetAt);
});

// ─────────────────────────────────────────────────────────────────────────────
// Reported directly again, months later: "box ev calc feature is significantly
// wrong... need to use TCGPlayer market price so that we have at least 98% of
// cards populated". Different root cause from the incident above — this time
// coverage, not a price-inflation outlier. Traced on live production: run
// 33636059799 hit a transient 502 on page 10 of TCGplayer's paginated search
// (from=450) and fetchTcgplayerProducts()'s per-page catch just `break`d,
// silently returning the 450 products it had so far as if that were the whole
// catalogue. refreshTcgplayerPrices() had no way to tell "the catalogue is
// really this small" apart from "the fetch gave up early" — its only gate was
// `rows.length === 0` — so it happily deleteMany()'d a complete prior
// catalogue and replaced it with the 431 cards that fetch matched (down from
// 1,244 on a clean run two days earlier). /tools/box-ev reads ONLY this table,
// so every pool's "N/total priced" collapsed toward "— understated" with
// nothing in CI or the logs surfacing it: the very next run's own summary line
// even read "TCGplayer (US): 2,155 products, 0 unmatched" — actually the SUM
// of that same degraded 431-row fetch written across all 5 currency markets,
// mislabelled as if it were 2,155 distinct, fully-matched US products.
// ─────────────────────────────────────────────────────────────────────────────

test("a page that fails is retried before the fetch gives up on it", () => {
  const src = readCode("src/lib/tcgplayer.ts");
  assert.ok(
    src.includes("async function fetchPageRetrying("),
    "expected a retry wrapper around fetchPage — a single transient 403/502 must not truncate the whole catalogue",
  );
  // Both product fetchers must go through the retrying wrapper, not the raw
  // one-shot fetchPage — including page 0, which used to have NO retry at all
  // (see run 33685886911: a bare 403 on page 0 killed the entire refresh).
  const productsAt = src.indexOf("export async function fetchTcgplayerProducts()");
  const sealedAt = src.indexOf("export async function fetchTcgplayerSealed()");
  assert.ok(productsAt >= 0 && sealedAt >= 0);
  const productsBody = src.slice(productsAt, sealedAt);
  const sealedBody = src.slice(sealedAt);
  for (const [name, body] of [["fetchTcgplayerProducts", productsBody], ["fetchTcgplayerSealed", sealedBody]] as const) {
    assert.ok(!/\bfetchPage\(/.test(body), `${name} must call fetchPageRetrying, not the raw fetchPage, for every page`);
    assert.ok(body.includes("fetchPageRetrying("), `${name} must call fetchPageRetrying`);
  }
});

test("refreshTcgplayerPrices refuses to replace existing rows with a much smaller set", () => {
  const src = readCode("src/lib/tcgplayer.ts");
  const fnAt = src.indexOf("export async function refreshTcgplayerPrices()");
  assert.ok(fnAt >= 0);
  const body = src.slice(fnAt);
  const countAt = body.indexOf("prisma.retailerPrice.count(");
  const floorAt = body.indexOf("rows.length < existing * COVERAGE_DROP_FLOOR");
  const deleteAt = body.indexOf("prisma.retailerPrice.deleteMany(");
  assert.ok(countAt >= 0, "expected refreshTcgplayerPrices to check the EXISTING row count before writing");
  assert.ok(floorAt >= 0, "expected a coverage-drop comparison against the existing count");
  assert.ok(deleteAt >= 0);
  // Ordering matters exactly like the promo-collision fix above: the guard is
  // worthless if the destructive delete already ran by the time it's checked.
  assert.ok(countAt < floorAt && floorAt < deleteAt, "the coverage-drop guard must run BEFORE deleteMany, not after");
});

test("the TCGplayer (US) import summary reports the US market's own row count, not the 5-market sum", () => {
  // `written` sums rows across US/UK/SG/AU/CA, which all reuse ONE product
  // fetch — reporting that sum under a "TCGplayer (US)" label is exactly what
  // hid the degraded run above behind a healthy-looking "2,155 products"
  // instead of the real "431 matched in the US market".
  const src = readCode("src/lib/price-import.ts");
  assert.ok(src.includes("byCountry.US"), "expected the (US) summary line to read byCountry.US specifically");
});

// ─────────────────────────────────────────────────────────────────────────────
// Reported directly again: riftcompare.com/card/teemo-swift-scout-ogn-263-298-
// promo — a manually-added alternate-art promo (OGN 263/298, isPromo: true) —
// linked to TCGplayer product 653061, the BASE "Origins - Teemo, Swift Scout"
// listing, instead of its own alt-art promo listing (670598, "Riftbound
// Promotional Cards - Teemo, Swift Scout - Alternate Art").
//
// The mirror image of the incident above. That one was a promo PRODUCT
// colliding with a real card via set+number; isPromoProduct(p) fixed it by
// excluding promo PRODUCTS from ever being matched that way. This one is a
// promo CARD on our own side reusing a base card's collector number — nothing
// excluded IT from populating byKey, so building byKey with a plain Map.set()
// let whichever of the two cards came last in prisma.card.findMany()'s
// (unordered) result silently steal the other's entry. Verified against a real
// Postgres locally: reproduced the exact live symptom on the pre-fix code
// (promo card resolved to the base product's price; the base card lost its own
// price entirely), then confirmed the fix resolves each product to its own
// correct card.
// ─────────────────────────────────────────────────────────────────────────────

test("promo cards are excluded from byKey/bySetlessNum, the same way promo products are", () => {
  const src = readCode("src/lib/tcgplayer.ts");
  assert.ok(src.includes("isPromo: true"), "the cards query must select isPromo to be able to exclude promo cards");
  const loopAt = src.indexOf("for (const c of cards)");
  const byKeySetAt = src.indexOf("byKey.set(", loopAt);
  const ifPromoAt = src.indexOf("if (c.isPromo)", loopAt);
  assert.ok(loopAt >= 0 && byKeySetAt >= 0 && ifPromoAt >= 0, "expected the cards loop, its byKey.set, and an isPromo branch");
  assert.ok(ifPromoAt < byKeySetAt, "the isPromo branch must run BEFORE byKey.set — after is worthless, the collision has already happened");
  const promoBranch = src.slice(ifPromoAt, byKeySetAt);
  assert.match(promoBranch, /continue;/, "the isPromo branch must skip byKey/bySetlessNum, not fall through to it");
});

test("byExternal is still populated for a promo card BEFORE the isPromo branch skips it", () => {
  // The branch must land after byExternal.set(c.externalId, ...) — a promo card
  // still needs to be reachable by its own externalId (either its own
  // "tcg-<productId>" link, or a PROMO_PRODUCT_OVERRIDES entry keyed to it);
  // skipping too early would silently make every promo card unpriceable.
  const src = readCode("src/lib/tcgplayer.ts");
  const loopAt = src.indexOf("for (const c of cards)");
  const byExternalSetAt = src.indexOf("byExternal.set(c.externalId", loopAt);
  const ifPromoAt = src.indexOf("if (c.isPromo)", loopAt);
  assert.ok(byExternalSetAt >= 0 && ifPromoAt >= 0);
  assert.ok(byExternalSetAt < ifPromoAt, "byExternal must be populated before the isPromo branch, not after");
});

test("PROMO_PRODUCT_OVERRIDES seeds byExternal with the verified Teemo alt-art pin", () => {
  const src = readCode("src/lib/tcgplayer.ts");
  const overridesAt = src.indexOf("const PROMO_PRODUCT_OVERRIDES");
  assert.ok(overridesAt >= 0, "expected the promo-product override map");
  assert.match(
    src,
    /"promo-ogn-263-teemo-swift-scout-altart":\s*670598/,
    "the live-verified TCGplayer product id for Teemo's alt-art promo must be pinned by the card's OWN existing externalId",
  );
  // Renaming the externalId instead of pinning a product id against the
  // existing one is the wrong fix: scripts/add-manual-cards.ts upserts a
  // manual card by matching its externalId, so a changed externalId would
  // make that lookup miss the already-live row and mint a genuine duplicate
  // under the new id, rather than fixing the one that's already indexed and
  // linked. This override map must never require editing manual-cards.json's
  // externalId field to work.
  const manualCards = read("prisma/manual-cards.json");
  assert.ok(
    manualCards.includes('"promo-ogn-263-teemo-swift-scout-altart"'),
    "the override's key must match manual-cards.json's card verbatim — an unreferenced pin fixes nothing",
  );

  // Feeds byExternal using the SAME "tcg-<productId>" convention the product-
  // match loop already checks for cards created directly from TCGplayer — no
  // second lookup path needed in the hot loop.
  const seedLoopAt = src.indexOf("for (const [cardExternalId, productId] of Object.entries(PROMO_PRODUCT_OVERRIDES))");
  assert.ok(seedLoopAt >= 0, "expected a loop seeding byExternal from the override map");
  const seedBody = src.slice(seedLoopAt, seedLoopAt + 300);
  assert.match(seedBody, /byExternal\.set\(`tcg-\$\{productId\}`/, "must register under the exact tcg-<id> key the product loop looks up");

  // Ordering: the seed loop reads byExternal.get(cardExternalId), so it must
  // run AFTER the cards loop has populated byExternal from real cards — same
  // "ordering matters" discipline as the incident above.
  const cardsLoopAt = src.indexOf("for (const c of cards)");
  assert.ok(cardsLoopAt >= 0 && cardsLoopAt < seedLoopAt, "the override-seeding loop must run after the cards loop, not before");
});

// ─────────────────────────────────────────────────────────────────────────────
// Immediate follow-up, same conversation: "no, we need tcgplayer prices even if
// they have a risk of being wrong" — an explicit rejection of the fix above's
// "no override → no price" tradeoff for the ~26 OTHER promo cards with no
// verified PROMO_PRODUCT_OVERRIDES pin. Coverage now beats accuracy for promo
// cards specifically: one with no price of its own clones whatever price its
// base sibling (same setCode+collectorNumber) resolved to, rather than showing
// nothing. Verified against a real Postgres locally with two scenarios: (1)
// only the base product in the pull — the promo card gets the base card's
// cloned price, and the base card keeps its own; (2) BOTH the base product and
// the promo's own pinned product in the pull — the pin still wins, the clone
// never overwrites a real match.
// ─────────────────────────────────────────────────────────────────────────────

test("a promo card with no price of its own is recorded for the base-sibling fallback", () => {
  const src = readCode("src/lib/tcgplayer.ts");
  const loopAt = src.indexOf("for (const c of cards)");
  const ifPromoAt = src.indexOf("if (c.isPromo)", loopAt);
  const byKeySetAt = src.indexOf("byKey.set(", loopAt);
  assert.ok(loopAt >= 0 && ifPromoAt >= 0 && byKeySetAt >= 0);
  const promoBranch = src.slice(ifPromoAt, byKeySetAt);
  assert.match(promoBranch, /promoFallbackKeys\.push\(/, "the isPromo branch must record a fallback key for every promo card");
});

test("the fallback pass runs strictly after `best` is fully resolved, and before rows are built", () => {
  const src = readCode("src/lib/tcgplayer.ts");
  const itemsLoopAt = src.indexOf("for (const p of items)");
  const bestSetAt = src.indexOf("if (!prev || marketForCompare > prev.market) best.set(key, { market: marketForCompare, price, p });");
  const fallbackLoopAt = src.indexOf("for (const { cardId: promoId, key, setless } of promoFallbackKeys)");
  const rowsAt = src.indexOf("const rows: Prisma.RetailerPriceCreateManyInput[] = [];");
  assert.ok(itemsLoopAt >= 0 && bestSetAt >= 0 && fallbackLoopAt >= 0 && rowsAt >= 0);
  assert.ok(itemsLoopAt < bestSetAt, "sanity: best.set must be inside the product-matching loop");
  assert.ok(bestSetAt < fallbackLoopAt, "the fallback pass must run after the product-matching loop finishes resolving `best`, not interleaved with it");
  assert.ok(fallbackLoopAt < rowsAt, "the fallback pass must run before rows are built from `best`");
});

test("the fallback never overwrites a promo card's own already-resolved price", () => {
  const src = readCode("src/lib/tcgplayer.ts");
  const fallbackLoopAt = src.indexOf("for (const { cardId: promoId, key, setless } of promoFallbackKeys)");
  assert.ok(fallbackLoopAt >= 0);
  const body = src.slice(fallbackLoopAt, fallbackLoopAt + 700);
  assert.match(
    body,
    /if \(best\.has\(promoSlot\)\) continue;/,
    "a promo card with its own verified price (externalId link or PROMO_PRODUCT_OVERRIDES pin) must keep it, not have it replaced by a clone",
  );
});

test("the fallback only READS byKey/bySetlessNum, and can never write a promo card into them", () => {
  const src = readCode("src/lib/tcgplayer.ts");
  const fallbackLoopAt = src.indexOf("for (const { cardId: promoId, key, setless } of promoFallbackKeys)");
  assert.ok(fallbackLoopAt >= 0);
  const body = src.slice(fallbackLoopAt, fallbackLoopAt + 700);
  assert.match(
    body,
    /setless \? bySetlessNum\.get\(key\) : byKey\.get\(key\)/,
    "must look up the base card's resolved price via the SAME keying its own base-sibling entry used",
  );
  assert.ok(
    !/byKey\.set|bySetlessNum\.set/.test(body),
    "the fallback pass must never write into byKey/bySetlessNum — that would reopen the exact base-card collision this file's earlier fix exists to prevent",
  );
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { allBoards } from "../src/lib/pokemon/board";
import { DISCORD_MAX, DISCORD_ROWS, offersAsOf, perPackShareText, productShareText, setShareText, type ShareOpts } from "../src/lib/pokemon/share-text";
import { headlineSentence, productOgLines, setOgLines } from "../src/lib/pokemon/og-lines";
import { textViolations } from "./helpers/pokemon-copy";
import type { PkCatalog, PkOfferRow, PkProductDetail, PkTile } from "../src/lib/pokemon/types";

// The two "carry our numbers somewhere else" surfaces besides the bot: the text
// "Copy for Reddit/Discord" puts on the clipboard (lib/pokemon/share-text.ts)
// and the words on the product and set share cards (lib/pokemon/og-lines.ts).
// Pasted text must stand on its own where links are banned: no URL and no brand
// unless asked for, never an affiliate or marketplace URL, the source named,
// "item price, postage extra" and the "as of" date always.

const catalog = JSON.parse(readFileSync("tests/fixtures/pokemon-catalog-us.json", "utf8")) as PkCatalog;
const product = JSON.parse(readFileSync("tests/fixtures/pokemon-product-etb.json", "utf8")) as PkProductDetail;
const NOW = Date.parse("2026-10-01T18:00:00Z");
const ENDING = "Cheapest listings, item price, postage extra. As of 1 Oct 2026.";

const row = (o: Partial<PkOfferRow>): PkOfferRow => ({
  market: "US",
  source: "ebay",
  priceCents: 0,
  currency: "USD",
  shippingCents: 499,
  url: "https://www.ebay.com/itm/1?campid=5339155912",
  title: "listing",
  inStock: true,
  checkedAt: "2026-10-01T09:00:00.000Z",
  ...o,
});

// Variants of the ETB fixture (US TCGplayer + market price, EU Cardmarket + trend).
const allMarkets: PkProductDetail = {
  ...product,
  offers: [
    ...product.offers,
    row({ priceCents: 10999 }),
    row({ market: "UK", currency: "GBP", priceCents: 8999, shippingCents: 0, url: "https://www.ebay.co.uk/itm/2" }),
    row({ market: "AU", currency: "AUD", priceCents: 18999, url: "https://www.ebay.com.au/itm/3" }),
    row({ market: "CA", currency: "CAD", priceCents: 16999, shippingCents: null, url: "https://www.ebay.ca/itm/4" }),
  ],
};
const usOnly: PkProductDetail = { ...product, offers: product.offers.filter((o) => o.market === "US") };
const noListing: PkProductDetail = { ...product, offers: product.offers.filter((o) => o.source === "tcgplayer_market") };

const boardsOf = (p: PkProductDetail) => allBoards(p.name, p.offers, { page: `/pokemon/sealed/${p.slug}`, surface: "product", now: NOW });
const opts = (format: "reddit" | "discord", withLink: boolean): ShareOpts => ({ format, withLink, now: NOW });

function everyText(): { label: string; text: string; format: "reddit" | "discord"; withLink: boolean }[] {
  const out: { label: string; text: string; format: "reddit" | "discord"; withLink: boolean }[] = [];
  for (const format of ["reddit", "discord"] as const) {
    for (const withLink of [false, true]) {
      for (const [name, p] of [
        ["all markets", allMarkets],
        ["US only", usOnly],
        ["no listing", noListing],
      ] as const) {
        for (const market of ["US", "UK", "EU", "SG"] as const) {
          out.push({
            label: `product ${name} ${market} ${format}${withLink ? " +link" : ""}`,
            text: productShareText(boardsOf(p), p.name, p.slug, p.packCount, offersAsOf(p.offers), market, opts(format, withLink)),
            format,
            withLink,
          });
        }
      }
      for (const slug of ["perfect-order", "delta-reign", "30th-celebration"]) {
        out.push({ label: `set ${slug} ${format}`, text: setShareText(catalog, slug, opts(format, withLink)) as string, format, withLink });
      }
      out.push({ label: `per pack ${format}`, text: perPackShareText(catalog, {}, opts(format, withLink)), format, withLink });
      out.push({
        label: `per pack boxes ${format}`,
        text: perPackShareText(catalog, { kinds: ["booster-box"], label: "Booster boxes", anchor: "booster-box", limit: 25 }, opts(format, withLink)),
        format,
        withLink,
      });
    }
  }
  return out;
}

test("Reddit: a pipe table with a header, an alignment row and one row per open listing", () => {
  const text = productShareText(boardsOf(allMarkets), product.name, product.slug, product.packCount, offersAsOf(product.offers), "US", opts("reddit", false));
  const lines = text.split("\n");
  assert.equal(lines[0], "**30th Celebration Elite Trainer Box**: cheapest listings in the United States");
  const at = lines.indexOf("| Where | Price | Per pack |");
  assert.ok(at > 0, text);
  assert.equal(lines[at + 1], "|:--|--:|--:|");
  assert.deepEqual(lines.slice(at + 2, at + 4), ["| eBay | US$109.99 + US$4.99 postage | US$12.22 |", "| TCGplayer | US$115.00 | US$12.78 |"], "cheapest first, eBay in its price position");
  const table = lines.filter((l) => l.startsWith("|"));
  for (const l of table) assert.equal(l.split("|").length, 5, l);
  assert.ok(text.includes("TCGplayer market price (a reference, not a listing): US$162.45"));
  assert.equal(lines.at(-1), ENDING);

  const uk = productShareText(boardsOf(allMarkets), product.name, product.slug, product.packCount, offersAsOf(product.offers), "UK", opts("reddit", false));
  assert.ok(uk.includes("| eBay UK | £89.99, free postage | £10.00 |"), uk);
  assert.match(uk, /TCGplayer market price \(a reference, not a listing\): ≈ £/);

  const sg = productShareText(boardsOf(product), product.name, product.slug, product.packCount, offersAsOf(product.offers), "SG", opts("reddit", false));
  assert.ok(sg.includes("No tracked listings in Singapore."), sg);
  assert.ok(!sg.includes("| Where"), "no empty table");

  const set = setShareText(catalog, "perfect-order", opts("reddit", false)) as string;
  assert.match(set, /^\| Type \| Product \| Cheapest listing \| Per pack \|$/m);
  assert.match(set, /^\|:--\|:--\|--:\|--:\|$/m);
  assert.match(set, /^\| Booster Box \| [^|]+ \| US\$[\d,.]+ on TCGplayer \| US\$[\d.]+ \|$/m);
  const pre = setShareText(catalog, "delta-reign", opts("reddit", false)) as string;
  assert.match(pre, /\(pre-order\) on TCGplayer \| US\$[\d.]+ \|/, "a pre-order is said as such, with its own per-pack figure");
  assert.equal(setShareText(catalog, "no-such-set", opts("reddit", false)), null);

  const ranked = perPackShareText(catalog, {}, opts("reddit", false));
  const perPack = [...ranked.matchAll(/^\| \d+ \| [^|]+ \| US\$([\d.,]+) \|/gm)].map((m) => Number(m[1].replace(/,/g, "")));
  assert.ok(perPack.length > 3);
  for (let i = 1; i < perPack.length; i++) assert.ok(perPack[i - 1] <= perPack[i], "lowest per pack first");
  assert.match(ranked, /pre-orders are left out/);
});

test("Discord: bullets, no table, at most one message and a capped number of rows", () => {
  const d = perPackShareText(catalog, { limit: 50 }, opts("discord", true));
  assert.ok(d.length <= DISCORD_MAX);
  assert.ok(!d.includes("|"), "Discord renders no tables");
  assert.ok(d.split("\n").filter((l) => l.startsWith("- ")).length <= DISCORD_ROWS);
  // A pathological catalogue: very long names would overflow one message, so rows are dropped.
  const long: PkCatalog = {
    ...catalog,
    tiles: catalog.tiles.map((t) => ({ ...t, name: `${t.name} ${"with a very long descriptive suffix ".repeat(8)}` })) as PkTile[],
  };
  const big = perPackShareText(long, { limit: 50 }, opts("discord", true));
  assert.ok(big.length <= DISCORD_MAX, String(big.length));
  assert.ok(big.endsWith(ENDING), "rows are dropped, never the ending");
  assert.ok(big.split("\n").filter((l) => l.startsWith("- ")).length >= 1);
  const p = productShareText(boardsOf(allMarkets), product.name, product.slug, product.packCount, offersAsOf(product.offers), "US", opts("discord", false));
  assert.deepEqual(
    p.split("\n").filter((l) => l.startsWith("- ")),
    ["- US$109.99 + US$4.99 postage · eBay · US$12.22 a pack", "- US$115.00 · TCGplayer · US$12.78 a pack"],
  );
});

test("with the link: exactly one URL, ours, tagged for the paste; without it: no URL and no brand", () => {
  for (const { label, text, format, withLink } of everyText()) {
    assert.ok(text.endsWith(ENDING), `${label}: ends with the as-of sentence`);
    const urls = text.match(/https?:\/\/\S+/g) ?? [];
    if (!withLink) {
      assert.deepEqual(urls, [], label);
      assert.doesNotMatch(text, /riftcompare/i, `${label}: no brand without the link`);
      continue;
    }
    assert.equal(urls.length, 1, label);
    const u = new URL(urls[0]);
    assert.equal(u.origin, "https://riftcompare.com");
    assert.match(u.pathname, /^\/pokemon\/(sealed|sets|price-per-pack)/);
    assert.equal(u.searchParams.get("utm_source"), format);
    assert.equal(u.searchParams.get("utm_medium"), "copy");
    assert.equal(u.searchParams.get("utm_campaign"), "pkmn-copy");
    assert.ok(text.split("\n").at(-2)?.startsWith("Source: https://riftcompare.com/"), label);
  }
  const anchored = perPackShareText(catalog, { kinds: ["booster-box"], anchor: "booster-box" }, opts("reddit", true));
  assert.match(anchored, /price-per-pack\?utm_source=reddit&utm_medium=copy&utm_campaign=pkmn-copy#booster-box/, "the query goes before the anchor");
});

test("no affiliate or marketplace host, no banned word, nothing undefined, in any pasted text", () => {
  for (const { label, text, format } of everyText()) {
    for (const host of ["ebay.", "tcgplayer.com", "pxf.io", "cardmarket.", "campid", "partner."]) {
      assert.ok(!text.toLowerCase().includes(host), `${label}: ${host}`);
    }
    assert.deepEqual(textViolations(text), [], label);
    assert.doesNotMatch(text, /\bNaN\b|\bundefined\b|\bnull\b|\btoday\b/i, label);
    if (format === "discord") assert.ok(text.length <= DISCORD_MAX, label);
  }
});

// ── Share-card lines ─────────────────────────────────────────────────────────

test("productOgLines: all markets, US only, no listing; US figures, the as-of date, never a NaN", () => {
  const all = productOgLines(allMarkets, NOW);
  assert.equal(all.name, "30th Celebration Elite Trainer Box");
  assert.equal(all.context, "Elite Trainer Box · 30th Celebration");
  assert.equal(headlineSentence(all.headline), "Cheapest US listing US$109.99 on eBay", "other markets never reach a US card");
  assert.equal(all.perPack, "US$12.22 a pack · 9 packs");
  assert.equal(all.reference, "TCGplayer market US$162.45 (reference)");
  assert.equal(all.preorder, null);
  assert.equal(all.footer, "Item price, postage extra · updated daily · as of 1 Oct 2026");

  const us = productOgLines(usOnly, NOW);
  assert.equal(headlineSentence(us.headline), "Cheapest US listing US$115.00 on TCGplayer");
  assert.equal(us.perPack, "US$12.78 a pack · 9 packs");
  assert.equal(us.noListing, null);

  const none = productOgLines(noListing, NOW);
  assert.equal(none.headline, null);
  assert.equal(none.noListing, "No tracked US listing");
  assert.equal(none.perPack, null, "no per-pack figure without a listing");
  assert.equal(none.reference, "TCGplayer market US$162.45 (reference)");

  const stale = productOgLines(usOnly, Date.parse("2026-10-10T00:00:00Z"));
  assert.equal(stale.headline, null, "a row past 72h is never the headline");

  const pre = productOgLines({ ...usOnly, presale: true, releasedOn: "2026-11-06" }, NOW);
  assert.equal(pre.preorder, "Pre-order: TCGplayer lists 6 Nov 2026");

  for (const l of [all, us, none, pre]) {
    const text = JSON.stringify(l);
    assert.doesNotMatch(text, /NaN|undefined|\btoday\b/, text);
    assert.deepEqual(textViolations(text), []);
    assert.doesNotMatch(text, /£|€|A\$|C\$|(?<!U)S\$|≈/, "US figures only");
  }
});

test("setOgLines: box, ETB and bundle from the cheapest listing with the price per pack; pre-orders said as such", () => {
  const po = setOgLines(catalog, "perfect-order");
  assert.ok(po);
  assert.equal(po.label, "US prices");
  assert.match(po.context, /^Mega Evolution · \d+ sealed products$/);
  assert.ok(po.rows.length >= 2 && po.rows.length <= 3);
  assert.equal(po.rows[0].kind, "Booster Box");
  for (const r of po.rows) {
    assert.match(r.text, /^from US\$[\d,.]+( \(US\$[\d.]+ a pack\))?$/, r.text);
    assert.equal(r.text, r.perPack ? `${r.price} (${r.perPack})` : r.price);
  }
  assert.match(po.release ?? "", /^TCGplayer lists \d{1,2} [A-Z][a-z]{2} \d{4}$/);
  assert.equal(po.footer, "Item price, postage extra · updated daily · as of 1 Oct 2026");

  const dr = setOgLines(catalog, "delta-reign");
  assert.ok(dr && dr.rows.length > 0);
  assert.equal(dr.release, "Pre-orders open: TCGplayer lists 6 Nov 2026");
  for (const r of dr.rows) {
    assert.match(r.text, /^pre-order from US\$[\d,.]+ \(US\$[\d.]+ a pack\)$/, r.text);
  }
  assert.equal(setOgLines(catalog, "no-such-set"), null);
  for (const l of [po, dr]) assert.deepEqual(textViolations(JSON.stringify(l)), []);
});

test("both share-card routes: lowercase cache-control (six hours, never immutable), nodejs, the loader's TTL, gated", () => {
  for (const f of ["src/app/pokemon/sealed/[slug]/opengraph-image.tsx", "src/app/pokemon/sets/[set]/opengraph-image.tsx"]) {
    const src = readFileSync(f, "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.match(code, /headers: \{ "cache-control": "public, max-age=0, s-maxage=21600, stale-while-revalidate=86400" \}/, f);
    assert.doesNotMatch(code, /immutable/, f);
    assert.doesNotMatch(code, /"Cache-Control"/, `${f}: a capitalised key would sit beside Next's default, not replace it`);
    assert.match(code, /export const runtime = "nodejs";/, f);
    assert.match(code, /export const revalidate = 21600;/, f);
    assert.match(code, /if \(!pokemonEnabled\(\)\) notFound\(\);/, f);
    assert.match(code, /PokemonBrandOgImage/, `${f}: a missing item draws the brand card, never a 500`);
  }
  assert.match(readFileSync("src/app/pokemon/opengraph-image.tsx", "utf8"), /if \(!pokemonEnabled\(\)\) notFound\(\);/);
});

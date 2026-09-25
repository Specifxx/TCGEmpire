import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ogPriceLines, ogMarketsFooter, type OgPriceCard } from "../src/lib/og-price";
import { COUNTRIES, DEFAULT_COUNTRY } from "../src/lib/country";
import { TRADE_CURRENCIES } from "../src/lib/trade-gremlin";

// The /card share image printed the AU column as "from A$…" to everyone, and its
// footer listed five markets without EU. The trade roast rejected CAD, EUR and
// SGD with a 400 the calculator swallowed. See lib/og-price.ts, lib/trade-gremlin.ts.

const none: OgPriceCard = {
  lowestPriceCents: null,
  lowestPriceCentsUs: null,
  lowestPriceCentsUk: null,
  lowestPriceCentsSg: null,
  lowestPriceCentsCa: null,
  lowestPriceCentsEu: null,
};

test("the headline is the default market, in its own currency", () => {
  assert.equal(DEFAULT_COUNTRY, "US");
  const { headline, others } = ogPriceLines({ ...none, lowestPriceCentsUs: 1234, lowestPriceCents: 1999, lowestPriceCentsEu: 1100 });
  assert.deepEqual(headline, { market: "US", text: "US$12.34" });
  assert.deepEqual(others, [
    { market: "EU", text: "€11.00" },
    { market: "AU", text: "A$19.99" },
  ]);
});

test("a card with no US price falls back EU → UK → CA → AU → SG", () => {
  assert.equal(ogPriceLines({ ...none, lowestPriceCentsEu: 500, lowestPriceCents: 900 }).headline?.text, "€5.00");
  assert.equal(ogPriceLines({ ...none, lowestPriceCentsUk: 500, lowestPriceCentsCa: 700 }).headline?.text, "£5.00");
  assert.equal(ogPriceLines({ ...none, lowestPriceCentsCa: 700, lowestPriceCents: 900 }).headline?.text, "C$7.00");
  assert.equal(ogPriceLines({ ...none, lowestPriceCents: 900, lowestPriceCentsSg: 800 }).headline?.text, "A$9.00");
  assert.equal(ogPriceLines({ ...none, lowestPriceCentsSg: 800 }).headline?.text, "S$8.00");
  assert.deepEqual(ogPriceLines(none), { headline: null, others: [] });
  assert.deepEqual(ogPriceLines(null), { headline: null, others: [] });
});

test("the AU column is never printed as US$, and every market keeps its own symbol", () => {
  const all: OgPriceCard = {
    lowestPriceCents: 101,
    lowestPriceCentsUs: 202,
    lowestPriceCentsUk: 303,
    lowestPriceCentsSg: 404,
    lowestPriceCentsCa: 505,
    lowestPriceCentsEu: 606,
  };
  const { headline, others } = ogPriceLines(all);
  const byMarket = Object.fromEntries([headline!, ...others].map((l) => [l.market, l.text]));
  assert.deepEqual(byMarket, { US: "US$2.02", EU: "€6.06", UK: "£3.03", CA: "C$5.05", AU: "A$1.01", SG: "S$4.04" });
  // An AU-only card must not borrow the headline market's currency.
  assert.equal(ogPriceLines({ ...none, lowestPriceCents: 101 }).headline?.text, "A$1.01");
});

test("the footer names every market, EU included", () => {
  const footer = ogMarketsFooter();
  for (const c of Object.values(COUNTRIES)) assert.match(footer, new RegExp(`\\b${c.code}\\b`));
  assert.match(footer, /\bEU\b/);
});

test("the /card OG route reads every market column and no longer hard-codes a footer", () => {
  const src = readFileSync(join(process.cwd(), "src/app/card/[id]/opengraph-image.tsx"), "utf8");
  for (const col of ["Us", "Uk", "Sg", "Ca", "Eu"]) assert.match(src, new RegExp(`lowestPriceCents${col}: true`));
  assert.match(src, /ogPriceLines\(/);
  assert.doesNotMatch(src, /formatMoney\(/, "prices must go through ogPriceLines, never formatMoney's AUD default");
  assert.doesNotMatch(src, /AU · US · UK/);
});

test("the trade roast accepts every market's currency", () => {
  for (const c of Object.values(COUNTRIES)) {
    assert.ok((TRADE_CURRENCIES as readonly string[]).includes(c.currency), `${c.code}'s ${c.currency} is rejected`);
  }
  const route = readFileSync(join(process.cwd(), "src/app/api/trade-roast/route.ts"), "utf8");
  assert.match(route, /z\.enum\(TRADE_CURRENCIES\)/);
});

test("POST /api/trade-roast with EUR returns 200 with text", async () => {
  // Force the rules path: no LLM call from a test.
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GEMINI_API_KEY;
  const { POST } = await import("../src/app/api/trade-roast/route");
  for (const currency of ["EUR", "CAD", "SGD"]) {
    const res = await POST(
      new Request("http://localhost/api/trade-roast", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": `10.0.0.${currency.length}${currency.charCodeAt(0)}` },
        body: JSON.stringify({ giveCents: 1000, getCents: 2500, currency, yours: ["A"], theirs: ["B"] }),
      })
    );
    assert.equal(res.status, 200, currency);
    const body = (await res.json()) as { text: string | null };
    assert.ok(body.text && body.text.length > 0, `${currency}: empty roast`);
  }
});

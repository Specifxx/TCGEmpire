import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { fetchProducts } from "../src/lib/sealed-import";

// ─────────────────────────────────────────────────────────────────────────────
// Sealed prices stored in the wrong currency (2026-10-15). The sealed importer
// sent Shopify `?country=UK` and `?country=EU`, our own market codes. Shopify
// does not recognise either, and a store with a US market then prices the request
// by the caller's location — the import runs on GitHub's US machines — so four UK
// stores were stored in US dollars as pounds (Monster Card Corner's £25.99
// Showdown Decks at "£40.00", Thistle Tavern's £35.00 Vault at "£50.00") and
// Universe TCG in dollars as euros. The singles importer always sent ISO codes
// through isoCountry (GB, ES). DECISIONS.md, "Stores we stopped reading kept
// their rows for two months" (same day).
// ─────────────────────────────────────────────────────────────────────────────

async function requestedCountry(market: "UK" | "EU" | "US" | "AU" | "SG" | "CA"): Promise<string | null> {
  const seen: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    seen.push(url);
    if (url.endsWith("/robots.txt")) return new Response("", { status: 404 });
    return new Response(JSON.stringify({ products: [] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    // A distinct host per market: robots.txt answers are cached per base.
    await fetchProducts(`https://iso-${market.toLowerCase()}.example`, "riftbound", market);
  } finally {
    globalThis.fetch = realFetch;
  }
  const products = seen.find((u) => u.includes("/products.json"));
  return products ? new URL(products).searchParams.get("country") : null;
}

test("the sealed collection read sends ISO country codes: GB for the UK, ES for the EU", async () => {
  assert.equal(await requestedCountry("UK"), "GB");
  assert.equal(await requestedCountry("EU"), "ES");
});

test("markets whose code is already ISO are sent unchanged", async () => {
  for (const m of ["US", "AU", "SG", "CA"] as const) assert.equal(await requestedCountry(m), m);
});

test("no importer builds a Shopify ?country= from a raw market code", () => {
  // Every server-side store read under src/lib must go through isoCountry. The
  // client components' `?country=` calls hit our own API and are not scanned.
  const dir = join(process.cwd(), "src/lib");
  const files = readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((f) => /\.tsx?$/.test(f));
  const offenders: string[] = [];
  for (const f of files) {
    const src = readFileSync(join(dir, f), "utf8");
    for (const m of src.matchAll(/[?&]country=\$\{([^}]*)\}/g)) {
      if (!/^isoCountry\(/.test(m[1])) offenders.push(`${f}: country=\${${m[1]}}`);
    }
  }
  assert.deepEqual(offenders, []);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { DEFAULT_COUNTRY, normalizeCountry } from "../src/lib/country";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// The market a visitor gets when there is nothing to detect.
// ─────────────────────────────────────────────────────────────────────────────
// Two completely different things in this codebase spell their fallback "AU",
// and conflating them is the expensive mistake:
//
//   • THE VISITOR'S MARKET — which currency and which stores a person sees when
//     geo says nothing. That is DEFAULT_COUNTRY, and it is the United States.
//   • A RETAILER'S OWN MARKET — RETAILERS entries declare `country?:` and the
//     ~15 Australian stores simply omit it, so `store.country ?? "AU"` is how an
//     AU store is identified at all.
//
// A blanket "AU" -> "US" sweep would reassign every Australian store to the US
// market: AUD listings priced as USD, AU stores shown to US shoppers, and the AU
// market emptied. So the second kind is asserted to SURVIVE, not to disappear.

test("the default market is the United States", () => {
  assert.equal(DEFAULT_COUNTRY, "US");
});

test("an undetectable visitor resolves to the default, not Australia", () => {
  for (const v of [undefined, null, "", "ZZ", "XX", "JP", "BR"]) {
    assert.equal(normalizeCountry(v), "US", `normalizeCountry(${JSON.stringify(v)})`);
  }
});

test("a detected region still wins over the default", () => {
  // The whole point of the default is that it only applies when detection fails.
  assert.equal(normalizeCountry("AU"), "AU");
  assert.equal(normalizeCountry("SG"), "SG");
  assert.equal(normalizeCountry("CA"), "CA");
  assert.equal(normalizeCountry("GB"), "UK", "the geo header uses ISO GB; we use UK");
  assert.equal(normalizeCountry("DE"), "DE", "Germany is its own real market now, not a UK fallback");
  assert.equal(normalizeCountry("FR"), "UK", "other EU visitors still browse the UK market's real GBP inventory");
});

test("getCountry's kill-switch collapses to DEFAULT_COUNTRY, not a literal", () => {
  const src = read("src/lib/get-country.ts");
  assert.match(
    src,
    /if \(!INTL_ENABLED\) return DEFAULT_COUNTRY;/,
    "disabling the switcher must not move everyone to a hard-coded market",
  );
  assert.ok(
    !/return "AU"/.test(src),
    "get-country.ts must not hard-code a market anywhere",
  );
});

test("the CLIENT kill-switch collapses to the same market as the server's", () => {
  // getCountry() (server) and CountryProvider (client) both hard-coded "AU" for
  // the disabled-switcher case. Two literals that must agree, in two files, with
  // nothing tying them together — and disagreement surfaces as a hydration
  // mismatch rather than a readable error.
  const src = read("src/components/CountryProvider.tsx");
  assert.match(src, /INTL_ENABLED \? initial : DEFAULT_COUNTRY/, "country state must fall back to DEFAULT_COUNTRY");
  assert.ok(!/: "AU"\)/.test(src), "CountryProvider must not hard-code a market");
});

test("no function takes AU as its default market", () => {
  // These are the landmines: `country: Country = "AU"` means any caller that
  // omits the argument silently queries the Australian market, whatever the
  // visitor's actual market is. Every current caller passes it explicitly, so
  // this is prevention rather than a live bug — which is exactly when it is
  // cheap to fix.
  const offenders: string[] = [];
  for (const file of walk(join(ROOT, "src"))) {
    for (const [i, line] of read(file.slice(ROOT.length + 1)).split("\n").entries()) {
      if (!/:\s*Country\s*=\s*"AU"/.test(line)) continue;
      // A local accumulator (`let best: Country = "AU"`) is not a market default;
      // it is a seed value that the next statement overwrites.
      if (/^\s*(let|const|var)\s/.test(line)) continue;
      offenders.push(`${file.slice(ROOT.length + 1)}:${i + 1}`);
    }
  }
  assert.deepEqual(offenders, [], `parameters defaulting to the AU market:\n  ${offenders.join("\n  ")}`);
});

test("a retailer's own AU market is NOT swept away", () => {
  // RETAILERS declares `country?:` optional; Australian stores omit it entirely.
  // `?? "AU"` is therefore load-bearing data logic, not a stale default, and a
  // well-meaning sweep that "fixes" it would silently move every AU store into
  // the US market.
  assert.match(read("src/lib/retailers.ts"), /country\?:/, "country stays optional on a retailer");
  for (const f of [
    "src/lib/price-import.ts",
    "src/lib/sealed-import.ts",
    "src/lib/deck-basket.ts",
    "src/lib/arbitrage.ts",
    "src/lib/retailers.ts",
  ]) {
    assert.match(read(f), /country \?\? "AU"/, `${f}: the retailer-market fallback must survive`);
  }
});

test("genuinely AU-specific logic survives too", () => {
  // Remote-postcode surcharges and Stripe Connect's AU handling are about
  // Australia the country, not about a default.
  assert.match(read("src/lib/shipping.ts"), /country === "AU"/);
  assert.match(read("src/lib/connect.ts"), /country === "AU"/);
});

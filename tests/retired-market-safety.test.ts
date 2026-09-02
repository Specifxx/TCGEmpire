import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { COUNTRIES, currencyOf, DEFAULT_COUNTRY, type Country } from "../src/lib/country";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const RISE = "src/lib/rise-predictor.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Guards against a real production incident (2026-08-20): /tools/rising returned
// a hard 500 on its default GLOBAL view for every visitor.
//
// Cause: New Zealand was removed as a supported market earlier that day, which
// deleted COUNTRIES.NZ — but purged NO data, leaving ~120 days of
// `country = 'NZ'` rows in the history database. getRisingCards' GLOBAL branch
// read PriceHistory with NO country filter, cast the raw text column straight to
// the `Country` union (`r.country as Country`), let "NZ" win the "best-covered
// market" vote for at least one card, then called currencyOf("NZ") —
// `COUNTRIES["NZ"]` was undefined and `.currency` threw a TypeError.
//
// The `as Country` cast is invisible to the compiler, so ONLY a test like this
// catches the class. It was reproducible from the outside: the default view 500'd
// while ?scope=AU / ?scope=US / ?scope=UK all returned 200, because the non-GLOBAL
// branch takes its market from the validated `scope`, never from the DB string.
// ─────────────────────────────────────────────────────────────────────────────

test("currencyOf survives a market code that no longer exists", () => {
  // The exact call that took the page down. A retired/unknown code must fall back,
  // never throw — this function is reachable from unconstrained DB text.
  assert.doesNotThrow(() => currencyOf("NZ" as Country));
  assert.equal(currencyOf("NZ" as Country), COUNTRIES[DEFAULT_COUNTRY].currency);
  assert.doesNotThrow(() => currencyOf(undefined as unknown as Country));
  // Live markets must still resolve to their own real currency, not the fallback.
  assert.equal(currencyOf("AU"), "AUD");
  assert.equal(currencyOf("SG"), "SGD");
});

test("rise-predictor validates PriceHistory.country before casting it to Country", () => {
  const src = read(RISE);
  // The bare cast is the bug. Any reintroduction must fail here.
  assert.ok(
    !/\(r\.country as Country\)\s*\|\|/.test(src),
    "must not cast a raw PriceHistory.country straight to Country and coalesce — validate against COUNTRIES first"
  );
  assert.match(
    src,
    /if \(!\(raw in COUNTRIES\)\) continue;/,
    "unknown market codes must be SKIPPED (not folded into a live market — that would merge another currency's prices into its range)"
  );
});

test("rise-predictor filters retired markets out of the GLOBAL history query", () => {
  const src = read(RISE);
  assert.match(
    src,
    /const KNOWN_COUNTRIES = Object\.keys\(COUNTRIES\) as Country\[\]/,
    "expected a KNOWN_COUNTRIES list derived from COUNTRIES, so it can never drift from the supported set"
  );
  assert.match(
    src,
    // The single-market half changed 2026-09-02 (CA/EU now redirect through
    // historySource — see tests/history-source-consolidation.test.ts) — this
    // test's own concern is only the GLOBAL half, which is untouched: still a
    // literal `{ in: KNOWN_COUNTRIES }`, never every retired market's rows.
    /country: scope === "GLOBAL" \? \{ in: KNOWN_COUNTRIES \} : historySource\(scope\)\.source/,
    "the GLOBAL branch must constrain country at the database, not read every retired market's rows back"
  );
});

test("getRisingCards degrades to an empty analysis instead of throwing", () => {
  const src = read(RISE);
  // Every other PriceHistory reader (price-history.ts, market-index.ts,
  // screener.ts) already does this; rise-predictor being the exception is the
  // only reason a data bug became an outage rather than an empty screener.
  assert.match(
    src,
    /export async function getRisingCards[\s\S]*?try \{[\s\S]*?return await computeRisingCards\(scope\)[\s\S]*?\} catch[\s\S]*?return emptyAnalysis\(scope\)/,
    "getRisingCards must wrap the computation and fall back to emptyAnalysis"
  );
  assert.match(src, /console\.error\(/, "the swallowed error must still be logged, or a persistently empty screener is undiagnosable");
});

test("rise-predictor covers every live market, not just the original three", () => {
  const src = read(RISE);
  const codes = Object.keys(COUNTRIES);

  // MARKET_PREF decides which price a GLOBAL card displays. A market missing here
  // falls through to the AU default and shows the wrong price under the wrong flag.
  const pref = src.match(/const MARKET_PREF: Country\[\] = \[([^\]]*)\]/);
  assert.ok(pref, "expected MARKET_PREF");
  for (const c of codes) {
    assert.ok(pref![1].includes(`"${c}"`), `MARKET_PREF is missing the ${c} market`);
  }

  // The universe select must request every price column UniverseCard declares —
  // an unselected column arrives as undefined and silently renders as "—",
  // and the `as UniverseCard[]` cast hides that from the compiler.
  const fn = src.match(/async function computeRisingCards[\s\S]*?\}\)\) as UniverseCard\[\];/);
  assert.ok(fn, "expected computeRisingCards' universe query");
  for (const c of codes) {
    if (c === "AU") continue; // AU is the bare `lowestPriceCents` column
    const field = `lowestPriceCents${c.charAt(0)}${c.slice(1).toLowerCase()}`;
    assert.ok(fn![0].includes(`${field}: true`), `universe select is missing ${field}`);
    assert.ok(fn![0].includes(`{ ${field}: { not: null } }`), `GLOBAL priced-OR clause is missing ${field}`);
  }
});

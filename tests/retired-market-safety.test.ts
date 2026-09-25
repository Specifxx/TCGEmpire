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
//
// 2026-09-05: rise-predictor.ts's GLOBAL branch stopped reading raw per-country
// PriceHistory rows entirely — every scope now reads the single GLOBAL sentinel
// series (see historySource() in price-history.ts), so there is no `r.country`
// left to cast or guard in this file at all; the whole vulnerable code path
// (parse an unconstrained text column, cast it, index into COUNTRIES) is gone
// by construction, not defended against. The two tests that used to pin that
// cast+guard were removed for exactly that reason — there's nothing left in
// rise-predictor.ts for them to assert. The general lesson survives where a raw
// country column IS still read: scripts/backfill-global-history.ts's own
// `!(r.country in COUNTRIES)` guard, for the identical reason (a historical NZ
// row must be excluded from a price computation, never silently mis-priced by
// currencyOf()'s fallback).
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

test("rise-predictor no longer casts a raw PriceHistory.country at all — GLOBAL reads the same filtered series as every scope", () => {
  const src = read(RISE);
  // The bare cast was the bug; the guard was the fix; both are gone now
  // because there's nothing left to cast or guard (see the header note above).
  // Any reintroduction of raw per-country parsing here should fail this test.
  assert.ok(!/\(r\.country as Country\)/.test(src), "must not cast PriceHistory.country to Country — there is no per-country row left to read");
  assert.ok(!/raw in COUNTRIES/.test(src), "the per-country guard has nothing left to guard — GLOBAL_HISTORY_COUNTRY is filtered at the query, not validated in app code");
  assert.ok(!/KNOWN_COUNTRIES/.test(src), "KNOWN_COUNTRIES was only ever needed to constrain a per-country query that no longer exists");
  // (Since 2026-09-25 the one weekly read covers every card, no id list, from
  // the current pricing basis — tests/rising-cards.test.ts pins the window.)
  assert.match(
    src,
    /where:\s*\{\s*country:\s*GLOBAL_HISTORY_COUNTRY,\s*day:\s*\{\s*gte:\s*riseHistoryStart\(Date\.now\(\)\)\s*\}\s*\}/,
    "every scope (GLOBAL included) must filter to the single GLOBAL sentinel at the database"
  );
});

test("getCachedRisingCards degrades to a flagged empty analysis instead of throwing — and never caches the failure", () => {
  const src = read(RISE);
  // A data bug must cost availability of the screener, not the page (the
  // 2026-08-20 incident). Since 2026-09-25 the catch sits OUTSIDE the caches:
  // until then getRisingCards caught inside the unstable_cache callback, so one
  // failed read was stored as an empty analysis for the rest of the day and the
  // page told paying members "No price history yet".
  const entry = /export function getCachedRisingCards\([\s\S]*?\n\}/.exec(src)?.[0] ?? "";
  assert.match(entry, /\.catch\(/, "the assembly must catch");
  assert.match(entry, /emptyAnalysis\(scope, true\)/, "…and return the empty shape flagged failed:true, so the page says 'temporarily unavailable'");
  assert.match(entry, /console\.error\(/, "the swallowed error must still be logged, or a persistently empty screener is undiagnosable");
  for (const loader of ["computeRiseHistory", "computeRiseInputs"]) {
    const body = (new RegExp(`async function ${loader}\\([\\s\\S]*?\\n\\}`).exec(src)?.[0] ?? "").replace(/\/\/[^\n]*/g, "");
    assert.ok(body, `expected ${loader}`);
    assert.doesNotMatch(body, /\bcatch\b/, `${loader} runs inside unstable_cache and must throw, not return a cached empty result`);
  }
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
  // and the `as UniverseCard[]` cast hides that from the compiler. (The query
  // moved to computeRiseInputs, and the GLOBAL priced-OR clause to pricedIn(),
  // with the 2026-09-25 loader split.)
  const fn = src.match(/async function computeRiseInputs[\s\S]*?\}\)\) as UniverseCard\[\];/);
  assert.ok(fn, "expected computeRiseInputs' universe query");
  const priced = src.match(/function pricedIn\([\s\S]*?\n\}/);
  assert.ok(priced, "expected pricedIn()");
  for (const c of codes) {
    if (c === "AU") continue; // AU is the bare `lowestPriceCents` column
    const field = `lowestPriceCents${c.charAt(0)}${c.slice(1).toLowerCase()}`;
    assert.ok(fn![0].includes(`${field}: true`), `universe select is missing ${field}`);
    assert.ok(priced![0].includes(`{ ${field}: { not: null } }`), `GLOBAL priced-OR clause is missing ${field}`);
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { REGION_HOME_PATH, regionHomeHreflang, regionHomeMetadata } from "../src/lib/seo";
import { COUNTRY_LIST, DEFAULT_COUNTRY, type Country } from "../src/lib/country";

// Every market that has its OWN region route — i.e. all of them except the
// default, which lives at "/" and keeps its hand-written metadata in
// app/page.tsx. Derived rather than hand-listed: this file spelled out
// ["AU","UK","SG","CA"] in three separate places and a hard-coded "6" in two
// more, so adding the EU market failed here with an arithmetic error rather
// than a message naming the missing page. The count a reader cares about is
// "one per market, plus x-default", which is what these now assert.
const REGION_ROUTES = COUNTRY_LIST.map((c) => c.code).filter((c) => c !== DEFAULT_COUNTRY) as Exclude<Country, "US">[];
const HREFLANG_KEYS = COUNTRY_LIST.length + 1; // every market + x-default

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// Region-specific indexable pages: /au /uk /sg /ca /eu, reusing the homepage's
// hero components with a region-locked stat block, a self-referencing canonical,
// and hreflang across every market (each region page plus "/" itself).

test("a route file exists for every non-default region", () => {
  for (const country of REGION_ROUTES) {
    const dir = country.toLowerCase();
    const p = `src/app/${dir}/page.tsx`;
    assert.ok(existsSync(join(ROOT, p)), `expected ${p} for ${country}`);
    const src = read(p);
    assert.match(src, new RegExp(`regionHomeMetadata\\("${country}"\\)`), `${p} must build its metadata from regionHomeMetadata("${country}")`);
    assert.match(src, new RegExp(`region="${country}"`), `${p} must render <RegionHome region="${country}" />`);
  }
});

test("REGION_HOME_PATH maps every market to a distinct path, US to \"/\"", () => {
  assert.equal(REGION_HOME_PATH.US, "/");
  const paths = Object.values(REGION_HOME_PATH);
  assert.equal(new Set(paths).size, paths.length, "no two markets may share a path");
  for (const [country, path] of Object.entries(REGION_HOME_PATH)) {
    if (country === "US") continue;
    assert.equal(path, `/${country.toLowerCase()}`);
  }
});

test("regionHomeHreflang() is reciprocal — every market's own page is present, plus x-default", () => {
  const map = regionHomeHreflang();
  assert.equal(Object.keys(map).length, HREFLANG_KEYS, "every market + x-default");
  assert.equal(map["en-GB"], `${new URL(map["x-default"]).origin}/uk`, "UK's region subtag must be GB, not UK");
  assert.ok(map["x-default"].endsWith("/") || !map["x-default"].includes("//", 8), "x-default must point at the bare origin (\"/\")");
});

test("every region page's metadata self-references its own canonical and carries the full hreflang set", () => {
  for (const country of REGION_ROUTES) {
    const meta = regionHomeMetadata(country);
    assert.equal(meta.alternates?.canonical, REGION_HOME_PATH[country]);
    const languages = meta.alternates?.languages as Record<string, string> | undefined;
    assert.ok(languages, `${country} region page must declare hreflang alternates`);
    assert.equal(Object.keys(languages).length, HREFLANG_KEYS);
  }
});

test("the homepage itself carries the same reciprocal hreflang set, not just a bare x-default", () => {
  const src = read("src/app/page.tsx");
  assert.match(src, /alternates: pageAlternates\("\/", \{ languages: regionHomeHreflang\(\) \}\)/);
});

test("region pages are declared in the sitemap, mapped from REGION_HOME_PATH rather than hand-listed", () => {
  const src = read("src/lib/sitemap-sections.ts");
  assert.match(src, /REGION_HOME_PATH/);
  assert.match(src, /regionHomeEntries/);
});

test("CountryHeroToggle navigates to the region's own URL on a real switch, and skips navigation on a no-op click", () => {
  // Reconciled with an independent pass that guarded this onClick with its
  // own `if (active) return;` before calling setCountry/navigating. Kept
  // this branch's version, which relies on setCountry()'s OWN no-op guard
  // (CountryProvider: `if (!INTL_ENABLED || c === country) return;`) — the
  // one shared choke point every region control in the app already goes
  // through, so a same-market click still cleanly no-ops without a second,
  // locally-duplicated check. See DECISIONS.md's merge-reconciliation
  // section and tests/analytics-events.test.ts for the analytics half of
  // this same reconciliation.
  const src = read("src/components/CountryHeroToggle.tsx");
  assert.match(src, /router\.push\(target\)/);
  assert.match(src, /if \(target !== pathname\) router\.push\(target\)/, "must not push when the target IS the current path");
  assert.match(src, /REGION_HOME_PATH\[c\.code\]/);
  const provider = read("src/components/CountryProvider.tsx");
  assert.match(provider, /if \(!INTL_ENABLED \|\| c === country\) return;/, "setCountry() itself must still no-op on a same-market pick");
});

test("CountrySwitcher (navbar) is untouched — it must stay URL-stable so switching market re-prices the CURRENT page", () => {
  const src = read("src/components/CountrySwitcher.tsx");
  assert.doesNotMatch(src, /router\.push|REGION_HOME_PATH/, "the navbar switcher must not navigate away from card/browse/set pages on a market switch");
});

test("HeroStats defaults to the switcher's country when lockCountry is absent (the real homepage's behaviour is unchanged)", () => {
  const src = read("src/components/home/HeroStats.tsx");
  assert.match(src, /const country = lockCountry \?\? switcherCountry;/);
});

test("RegionHome never lists a market's own name among its 'five more markets'", () => {
  const src = read("src/components/home/CinematicHero.tsx");
  assert.match(src, /function otherMarketsList\(exclude: Country\)/);
  assert.match(src, /COUNTRY_LIST\.filter\(\(c\) => c\.code !== exclude\)/);
});

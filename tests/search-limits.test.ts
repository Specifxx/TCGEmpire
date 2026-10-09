import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SEARCH_LIMITS,
  currentState,
  limitCopy,
  meter,
  sameSearch,
  searchCapsEnabled,
  searchLimitFor,
  wouldRefuse,
  type QuotaState,
} from "../src/lib/search-quota";
import { decodeQuota, encodeQuota } from "../src/lib/search-quota-cookie";

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH IS METERED AGAIN (2026-10-09, owner): signed out 10 searches a day, a
// free account 30, Plus 100, Premium unlimited. DECISIONS.md, "Search is
// metered again". This replaced tests/search-uncapped.test.ts, which guarded the
// removal of an earlier 10/100/unlimited ladder after it cost pages per visitor
// (3.86 → 2.75) and ~40% of buy clicks in about a day. The owner was shown
// those numbers and chose these limits, so what this file pins is that the
// meter stays narrow and cheap to switch off: one kill switch, never on a card,
// set or champion page, never on a crawler, never on the store tools.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const DAY = "2026-10-09";
const fresh = (u = ""): QuotaState => ({ d: DAY, n: 0, q: "", u });

test("the ladder: 10 signed out, 30 free, 100 Plus, Premium unlimited", () => {
  assert.deepEqual(SEARCH_LIMITS, { anon: 10, free: 30, plus: 100 });
  assert.equal(searchLimitFor("anon"), 10);
  assert.equal(searchLimitFor("free"), 30);
  assert.equal(searchLimitFor("plus"), 100);
  assert.equal(searchLimitFor("premium"), null);
});

test("SEARCH_CAPS=off is the one kill switch", () => {
  assert.equal(searchCapsEnabled({}), true);
  assert.equal(searchCapsEnabled({ SEARCH_CAPS: "on" }), true);
  assert.equal(searchCapsEnabled({ SEARCH_CAPS: "off" }), false);
  assert.equal(searchCapsEnabled({ SEARCH_CAPS: " OFF " }), false);
});

test("typing one query is one search; a new query counts; the limit refuses", () => {
  let s = fresh();
  for (const q of ["ak", "aka", "akal", "akali", "akali rogue"]) {
    const d = meter(s, q, 2);
    assert.ok(d.allowed);
    s = d.state;
  }
  assert.equal(s.n, 1, "a typist's prefixes are one search");
  const backspaced = meter(s, "akali", 2);
  assert.equal(backspaced.counted, false, "shortening the same query is free");
  const jinx = meter(s, "jinx", 2);
  assert.ok(jinx.allowed && jinx.counted);
  s = jinx.state;
  assert.equal(s.n, 2);
  const third = meter(s, "ahri", 2);
  assert.equal(third.allowed, false, "past the limit a new query is refused");
  assert.equal(third.state, s, "a refused query changes nothing");
  assert.ok(meter(s, "jinx demolitionist", 2).allowed, "the last counted search can still be refined");
  assert.ok(wouldRefuse(s, "ahri", 2));
  assert.ok(!wouldRefuse(s, "jinx", 2));
  assert.ok(sameSearch("Akali  Rogue", "akali"));
  assert.ok(!sameSearch("", "akali"));
});

test("unlimited never counts, and the count resets by day and by account", () => {
  const s = { ...fresh(), n: 500, q: "x" };
  assert.ok(meter(s, "anything", null).allowed);
  assert.equal(meter(s, "anything", null).counted, false);
  assert.equal(currentState({ ...s, d: "2026-10-08" }, "", DAY).n, 0, "a new UTC day starts at zero");
  assert.equal(currentState(s, "user-1", DAY).n, 0, "signing in does not inherit a signed-out count");
  assert.equal(currentState(s, "", DAY).n, 500);
});

test("the cookie is signed: a tampered count is ignored", () => {
  const secret = "test-secret-0123456789";
  const raw = encodeQuota({ d: DAY, n: 3, q: "akali", u: "u1" }, secret);
  assert.deepEqual(decodeQuota(raw, secret), { d: DAY, n: 3, q: "akali", u: "u1" });
  const [body, sig] = raw.split(".");
  const forged = Buffer.from(JSON.stringify({ d: DAY, n: 0, q: "", u: "u1" })).toString("base64url");
  assert.equal(decodeQuota(`${forged}.${sig}`, secret), null);
  assert.equal(decodeQuota(`${body}.${sig}`, "other-secret"), null);
  assert.equal(decodeQuota("garbage", secret), null);
  assert.equal(decodeQuota(undefined, secret), null);
});

test("the limit copy names the next tier", () => {
  assert.match(limitCopy("anon").next, /Sign up free for 30 a day/);
  assert.match(limitCopy("free").next, /Plus gives you 100 a day/);
  assert.match(limitCopy("plus").next, /Premium searches without a limit/);
});

test("the search API meters everything except the store tools, and never caches a metered answer", () => {
  const route = read("src/app/api/search/route.ts");
  assert.match(route, /searchParams\.get\("scope"\) !== "tool"/);
  assert.match(route, /limited: true, tier: ctx\.tier, limit: ctx\.limit/);
  assert.match(route, /"Cache-Control": "private, no-store"/);
  for (const f of ["src/components/CardSearch.tsx", "src/components/TradeCalculator.tsx", "src/components/MyCollection.tsx"]) {
    assert.match(read(f), /\/api\/search\?q=\$\{encodeURIComponent\(\w+\)\}&scope=tool/, `${f} is a tool lookup, not a search`);
  }
  const server = read("src/lib/search-quota-server.ts");
  assert.match(server, /isBotUserAgent\(headers\(\)\.get\("user-agent"\)\)/, "crawlers are never metered");
  assert.match(server, /if \(!searchCapsEnabled\(\)\)/);
});

test("/browse refuses a search before querying, and counts an allowed one from the client", () => {
  const page = read("src/app/browse/page.tsx");
  const refuse = page.indexOf("if (quota && refusedNow(quota, searchQ))");
  assert.ok(refuse > 0 && refuse < page.indexOf("const runQuery = () =>"), "no database query for a refused search");
  assert.match(page, /\{quota\?\.metered && <SearchQuotaTick q=\{searchQ\} \/>\}/);
  assert.match(page, /searchQ\.length >= 2 && page === 1 \? await quotaContext\(\)/, "only a text search's first page is metered");
});

test("the dropdown shows the limit panel, and /premium lists the allowance", () => {
  const bar = read("src/components/SearchBar.tsx");
  assert.match(bar, /if \(data\.limited\)/);
  assert.match(bar, /<SearchLimitPanel tier=\{limited\}/);
  assert.match(read("src/components/SearchLimitPanel.tsx"), /surface="limit:search"/);
  assert.match(read("src/components/TierComparisonTable.tsx"), /Card searches a day/);
  // The pages that compare prices are never metered.
  for (const f of ["src/app/card/[id]/page.tsx", "src/app/sets/[set]/page.tsx", "src/app/champions/[slug]/page.tsx"]) {
    assert.doesNotMatch(read(f), /search-quota/, `${f} must not be metered`);
  }
});

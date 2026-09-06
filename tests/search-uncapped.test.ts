import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const exists = (p: string) => existsSync(join(ROOT, p));

const SEARCH_API = "src/app/api/search/route.ts";
const SEARCHBAR = "src/components/SearchBar.tsx";
const PREMIUM_PAGE = "src/app/premium/page.tsx";
const POPUP = "src/components/SignupPromoPopup.tsx";

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH IS UNMETERED. This file replaced tests/search-limits.test.ts, which
// guarded a tiered daily allowance (10 anon / 100 free / unlimited Premium,
// enforced by an httpOnly counter cookie). That ladder shipped and was removed
// after ~24h in production: core-market pages/visitor fell 3.86 → 2.75, bounce
// rose 5pts, and buy_click dropped ~40%, while the gate it powered converted
// essentially nobody.
//
// Search is the top of every funnel that ends in a buy_click, so capping it
// taxed exactly the behaviour the site exists to produce. These tests exist so
// a growth-motivated meter cannot quietly reappear on this route.
//
// NOT in scope here: lib/rate-limit.ts, the genuine abuse/cost protection used
// by ~20 other routes. That is a different mechanism for a different reason and
// is deliberately left alone — if /api/search ever needs protecting, it should
// use that, sized so no real user reaches it.
// ─────────────────────────────────────────────────────────────────────────────

test("the search-limit ladder's modules are gone, not merely unreferenced", () => {
  // Env-defaulting a limit to Infinity would leave a stale deploy-environment
  // variable able to switch the cap back on silently. The modules are deleted.
  assert.ok(!exists("src/lib/search-limits.ts"), "lib/search-limits.ts still exists");
  assert.ok(!exists("src/lib/search-quota.ts"), "lib/search-quota.ts still exists");
});

test("no module anywhere still imports the ladder", () => {
  for (const f of [SEARCH_API, SEARCHBAR, PREMIUM_PAGE, POPUP]) {
    const src = read(f);
    assert.ok(!/search-limits|search-quota/.test(src), `${f} still imports the removed ladder modules`);
    assert.ok(!/ANON_SEARCH_LIMIT|FREE_SEARCH_LIMIT/.test(src), `${f} still references a search-limit constant`);
  }
});

test("the search API counts nothing, sets no quota cookie, and refuses nobody", () => {
  const src = read(SEARCH_API);
  assert.ok(!/tickQuota|SEARCH_QUOTA_COOKIE|rc_search_q/.test(src), "the quota meter must be gone");
  assert.ok(!/limited: true/.test(src), "the route must have no blocked-response branch");
  // The route stopped needing a session at all once the tier ladder went — a
  // reintroduced getCurrentUser() here is the first step back toward metering.
  assert.ok(!/getCurrentUser|isPremium/.test(src), "search must not branch on who the visitor is");
  assert.ok(!/cookies\(\)/.test(src), "search must not read or write cookies");
});

test("the SearchBar has no gate panel and no 'searches left' counter", () => {
  const src = read(SEARCHBAR);
  assert.ok(!/searches left today|Last free search|free searches/i.test(src), "the remaining-searches nudge must be gone");
  assert.ok(!/data\.limited/.test(src), "the dropdown must not handle a limited response");
  assert.ok(!/search_gate_shown/.test(src), "the gate impression event must be gone with the gate");
  assert.ok(!/markSignupSource\("gate"\)/.test(src), "the gate's signup attribution must be gone");
});

test("the premium page no longer sells a search allowance", () => {
  const src = read(PREMIUM_PAGE);
  assert.ok(!/Card searches per day/.test(src), "the tier table must not advertise a search ladder");
  assert.ok(!/Unlimited"/.test(src) || !/searches/i.test(src), "no unlimited-search upsell may remain");
});

test("the signup popup no longer sells a search allowance", () => {
  const src = read(POPUP);
  assert.ok(!/Searches per day|more searches/i.test(src), "the popup must not pitch a search allowance");
  assert.ok(!/Signed out/.test(src), "the three-tier search ladder block must be gone");
});

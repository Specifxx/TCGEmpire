import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FREE_LIMIT_STATUS, FREE_PORTFOLIO_LIMIT, freeLimitBody, parseFreeLimit } from "../src/lib/free-limits";
import { portfolioAllowance } from "../src/lib/free-limits-server";
import { SIGNUP_SOURCES } from "../src/lib/signup-source-shared";
import { TIER_COMPARISON } from "../src/components/TierComparisonTable";
import { freeLimitPitch } from "../src/components/FreeLimitPanel";
import { isPreorderSetCode } from "../src/lib/constants";
import { numberWithoutTotal } from "../src/lib/set-scope";

// ─────────────────────────────────────────────────────────────────────────────
// THE SET TRACKER'S WIRING (2026-09-29, DECISIONS.md, "Set tracker"): the
// released /sets/[set] page reads neither cookies nor the user, the tick is the
// existing add path with its 402, Radiance shows "N revealed" until it is out,
// and the set view carries no P&L wording.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (p: string) => read(p).replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const SET_PAGE = "src/app/sets/[set]/page.tsx";

test("/sets/[set] never imports cookies or the session: the owned overlay is client-side", () => {
  const c = code(SET_PAGE);
  assert.doesNotMatch(c, /getCurrentUser|@\/lib\/auth|from "next\/headers"|\bcookies\(|getSession|useMe\b/, "a session read here would break the shared memoised default view");
  assert.doesNotMatch(c, /collectionCard|ownedBySet|set-owned/, "no per-request owned read on the page");
  // It mounts the overlay and nothing else of the tracker.
  assert.match(c, /<SetOwnedProvider setCode=\{set\.code\} enabled=\{trackerOpen\}>/);
  assert.match(c, /<SetTickLayer tileIds=\{cards\.map\(\(c\) => c\.id\)\} rowIds=\{priceGuide\.map\(\(r\) => r\.id\)\} scanKey=\{JSON\.stringify\(searchParams\)\} \/>/);
  assert.match(c, /\{\.\.\.\(trackerOpen \? \{ "data-tick-grid": "" \} : \{\}\)\}/, "one marker on the grid, only when the set is open");
  assert.doesNotMatch(c, /<OwnedTick|data-c=/, "no tick component or per-card attribute per tile: they added 147 KB and 101 KB to the page");
  assert.match(c, /<SetOwnedStatus /);
  assert.match(c, /ticks=\{trackerOpen\}/);
  // Released sets only, decided by the date, not by the flag that outlives release day.
  assert.match(c, /const trackerOpen = totalInSet > 0 && !isPreorderSetCode\(set\.code\)/);
  // The queries the page makes are the ones it made before: no new read was added.
  assert.equal((c.match(/prisma\./g) ?? []).length, 6, "the same six prisma calls as before the tracker");
  assert.doesNotMatch(c, /generateStaticParams/);
});

test("the overlay reads the owned map from the authenticated no-store route, only for a signed-in visitor", () => {
  const c = code("src/components/SetOwned.tsx");
  assert.match(c, /fetchMe\(\)/, "signed-out is known from /api/me, so an anonymous visitor makes no request");
  assert.match(c, /\/api\/collection\/owned\?set=\$\{encodeURIComponent\(setCode\)\}/);
  assert.match(c, /cache: "no-store"/);
  assert.ok(c.indexOf("if (!me.user)") < c.indexOf("/api/collection/owned"));
  assert.match(c, /src=set_tracker/, "a signed-out tick goes to sign-up, attributed");
  assert.ok(SIGNUP_SOURCES.has("set_tracker"));
});

test("the tick is the existing add path: POST /api/collection, whose 402 opens the limit:portfolio panel inline", () => {
  const c = code("src/components/SetOwned.tsx");
  assert.match(c, /fetch\("\/api\/collection", \{\s*method: "POST"/);
  assert.match(c, /res\.status === FREE_LIMIT_STATUS/);
  assert.match(c, /parseFreeLimit\(/);
  assert.match(c, /<FreeLimitPanel kind="portfolio" context="set"/, "the existing panel, whose surface is limit:portfolio");
  const panel = code("src/components/FreeLimitPanel.tsx");
  assert.match(panel, /surface=\{`limit:\$\{kind\}`\}/);
  // Nothing is claimed as added unless the route said ok: 409 and 5xx leave the tick as it was.
  assert.match(c, /if \(!res\.ok\) return;/);
  assert.ok(c.indexOf("if (!res.ok) return;") < c.indexOf("setOwned((o)"));
  // The route enforces it: the add refuses a new card before any write.
  const route = code("src/app/api/collection/route.ts");
  assert.ok(route.indexOf("portfolioAllowance(") < route.indexOf("addCopies("));
  assert.match(route, /freeLimitBody\("portfolio"[^)]*\), \{ status: FREE_LIMIT_STATUS \}/);
});

test("the 51st distinct card on a free account is a 402 body; the 50th and any held card are not", async () => {
  const free = { id: "u1", isAdmin: false, premiumUntil: null, premiumTier: null, premiumTierFloor: null };
  const plus = { ...free, premiumUntil: new Date("2099-01-01T00:00:00Z"), premiumTier: "plus" };
  const db = (distinct: number, held: string[] = []) =>
    ({
      collectionCard: { findMany: async () => held.map((cardId) => ({ cardId })) },
      $queryRaw: async () => [{ n: distinct }],
    }) as never;
  const at50 = await portfolioAllowance(db(50), free, ["new"]);
  assert.deepEqual(at50.blocked, ["new"], "a new card at 50 is refused");
  const body = freeLimitBody("portfolio", at50.count ?? at50.limit);
  assert.equal(FREE_LIMIT_STATUS, 402);
  assert.equal(body.code, "free_limit");
  assert.equal(body.kind, "portfolio");
  assert.equal(body.limit, FREE_PORTFOLIO_LIMIT);
  assert.deepEqual(parseFreeLimit(JSON.parse(JSON.stringify(body))), body, "the overlay can read it back");
  assert.deepEqual((await portfolioAllowance(db(49), free, ["new"])).blocked, [], "the 50th is allowed");
  assert.deepEqual((await portfolioAllowance(db(80, ["old"]), free, ["old"])).blocked, [], "grandfathered: a held card over the limit keeps working");
  assert.deepEqual((await portfolioAllowance(db(500), plus, ["new"])).blocked, [], "Plus has no limit, so a whole set fits");
});

test("the set-page limit panel says nobody loses what they have, and carries no value wording", () => {
  for (const plusOnSale of [true, false]) {
    const t = freeLimitPitch("portfolio", plusOnSale, "set");
    assert.match(t, /Nobody loses cards they already have/);
    assert.match(t, /a whole set fits/);
    assert.doesNotMatch(t, /\bvalue\b|\bworth\b/i);
  }
  // The other surfaces keep their own wording.
  assert.match(freeLimitPitch("portfolio", true), /keeps its value/);
  assert.doesNotMatch(freeLimitPitch("watchlist", true), /whole set/);
});

test("Radiance: 'N revealed' with no denominator, percentage, bar or cost until it is released", () => {
  const RAD = new Date("2026-10-01T00:00:00Z");
  assert.equal(isPreorderSetCode("RAD", RAD), true);
  assert.equal(isPreorderSetCode("RAD", new Date("2026-10-24T00:00:00Z")), false, "opens by the date, not by a flag");
  assert.equal(isPreorderSetCode("OGN", RAD), false);
  for (const f of ["src/app/portfolio/sets/page.tsx", "src/app/portfolio/sets/[set]/page.tsx"]) {
    assert.match(code(f), /isPreorderSetCode\(set\.code\)/, f);
  }
  const t = code("src/components/SetTracker.tsx");
  const pre = t.slice(t.indexOf("if (preRelease) {"), t.indexOf("const scopeInfo"));
  assert.ok(pre.length > 200);
  assert.match(pre, /preReleaseLine\(pre\)/);
  assert.doesNotMatch(pre, /percent|progressbar|costCents|SET_FOOTER_COPY|summarise\(|\.total\b/, "no fraction, percentage, bar or cost");
  const idx = code("src/app/portfolio/sets/page.tsx");
  const branch = idx.slice(idx.indexOf("if (pre) {"), idx.indexOf("const base = summarise"));
  assert.match(branch, /preReleaseLine\(p\)/);
  assert.doesNotMatch(branch, /percent|progressbar|\.total\b/);
});

test("the checklist page states the footer verbatim and names its scopes as printings we track", () => {
  const t = code("src/components/SetTracker.tsx");
  assert.match(t, /\{SET_FOOTER_COPY\}/);
  assert.match(t, /Counts are printings in our catalogue/);
  const scope = code("src/lib/set-scope.ts");
  assert.match(scope, /"Cheapest listing per card, before postage\. Best Basket prices delivery\."/);
  assert.match(scope, /label: "Base set"/);
  assert.match(scope, /label: "Every printing we track"/);
  assert.match(t, /Any finish and any condition counts as owned/);
});

test("no P&L, value, prediction or urgency words anywhere in the set view", () => {
  const banned = /\bworth\b|\bprofit|\bROI\b|\bgain(ed|s)?\b|\bP&L\b|\binvest|\bflip|\bpredict|\bvalue\b|\bsav(e|ing|ings)\b|\bdeal\b|\bhurry|\bsell(s|ing)? out\b|\bgrab\b|\bbefore it/i;
  for (const f of [
    "src/components/SetTracker.tsx",
    "src/components/SetOwned.tsx",
    "src/components/SetMissingActions.tsx",
    "src/app/portfolio/sets/page.tsx",
    "src/app/portfolio/sets/[set]/page.tsx",
  ]) {
    // The attribute `value=` and `e.target.value` are code, not words a reader sees.
    const shown = code(f).replace(/\bvalue=(\{[^}]*\}|"[^"]*")/g, "").replace(/\.value\b/g, "");
    const m = shown.match(banned);
    assert.equal(m, null, `${f} uses "${m?.[0]}"`);
  }
});

test("the tracker pages are noindex, per-request, read no searchParams and never call notFound (a loading.tsx sits above /portfolio)", () => {
  for (const f of ["src/app/portfolio/sets/page.tsx", "src/app/portfolio/sets/[set]/page.tsx"]) {
    const c = code(f);
    assert.match(c, /export const dynamic = "force-dynamic"/, f);
    assert.match(c, /robots: \{ index: false, follow: false \}/, f);
    assert.doesNotMatch(c, /searchParams|notFound\(/, f);
    assert.match(c, /redirect\(`?"?\/login\?next=/, `${f} bounces a signed-out visitor to sign-in`);
    assert.doesNotMatch(c, /generateStaticParams/, f);
  }
});

test("/portfolio links to the checklist, and the tier table row is the enforced number", () => {
  assert.match(code("src/app/portfolio/page.tsx"), /href="\/portfolio\/sets"/);
  const row = TIER_COMPARISON.find((r) => r.feature.startsWith("Set tracker"))!;
  assert.ok(row);
  assert.deepEqual([row.account, row.plus, row.premium], [`Up to ${FREE_PORTFOLIO_LIMIT} cards`, "Whole sets, no limit", "Whole sets, no limit"]);
  assert.match(read("src/components/PremiumSlideIn.tsx"), /\{ label: "Set tracker" \}/);
  const premium = read("src/app/premium/page.tsx");
  assert.match(premium, /title: "Set tracker: whole sets, no limit"/);
  assert.match(premium, /q: "Do I have to pay to see what my set is missing\?"/);
});

test("the price guide row and the tile carry the tick, and only when the set is open", () => {
  const g = code("src/components/sets/SetPriceGuide.tsx");
  assert.match(g, /\{\.\.\.\(ticks \? \{ "data-tick-rows": "" \} : \{\}\)\}/, "one marker on the tbody");
  assert.doesNotMatch(g, /OwnedTick|data-c/, "no per-row markup; the client layer pairs the rows with the ids by position");
  assert.match(g, /ticks = false/);
});

test("a pre-release set never prints a '/TTT' total on a card row; a released set keeps it", () => {
  assert.equal(numberWithoutTotal("001/167"), "001");
  assert.equal(numberWithoutTotal("112a/298"), "112a");
  assert.equal(numberWithoutTotal("SP1"), "SP1");
  const t = code("src/components/SetTracker.tsx");
  const pre = t.slice(t.indexOf("if (preRelease) {"), t.indexOf("const scopeInfo"));
  assert.match(pre, /<Row [^>]*priced=\{false\} hideTotal \/>/, "the pre-release list hides the denominator");
  assert.match(t, /hideTotal \? numberWithoutTotal\(c\.collectorNumber\) : c\.collectorNumber/);
  const released = t.slice(t.indexOf("const scopeInfo"), t.indexOf("function Row("));
  assert.doesNotMatch(released, /hideTotal/, "the released list's rows still show OGN · 132/298");
});

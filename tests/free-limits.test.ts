import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  FREE_LIMIT_STATUS,
  FREE_PORTFOLIO_LIMIT,
  FREE_WATCHLIST_LIMIT,
  checkFreeAllowance,
  freeLimitBody,
  freeLimitCounterText,
  parseFreeLimit,
  showFreeLimitCounter,
  wouldHitFreeLimit,
  type HoldingsCounter,
} from "../src/lib/free-limits";
import { portfolioAllowance, portfolioHoldings, watchAllowance, watchHoldings } from "../src/lib/free-limits-server";
import { BASKET_SAVING_MIN_CENTS, basketSavingPitch } from "../src/lib/basket-saving";
import { isPremiumSurface, LIMIT_SURFACES } from "../src/lib/premium-surface";
import { TIER_COMPARISON } from "../src/components/TierComparisonTable";
import { PREMIUM_COPY_VERSION, PREMIUM_PRICE_LABEL } from "../src/lib/site";

// ─────────────────────────────────────────────────────────────────────────────
// THE FREE LIMITS (owner, 2026-09-28 — DECISIONS.md, "Free limits: charge for
// what people use every week"): a free account watches up to 10 distinct cards
// and keeps up to 50 distinct cards in its portfolio; any paid tier is
// unlimited. NOBODY LOSES ANYTHING: only adding a NEW card is refused while the
// account already holds the limit. The upgrade prompt appears where the limit
// is hit, Best Basket leads with the list's own saving in money, and the
// signed-in slide-in and gold header CTAs are gone.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const code = (p: string) => read(p).replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const PAID_UNTIL = new Date("2099-01-01T00:00:00Z");
const free = { id: "u1", email: "a@x.com", isAdmin: false, premiumUntil: null, premiumTier: null, premiumTierFloor: null };
const plus = { ...free, premiumUntil: PAID_UNTIL, premiumTier: "plus" };
const lapsed = { ...plus, premiumUntil: new Date("2020-01-01T00:00:00Z") };
const admin = { ...free, isAdmin: true };

/** A counter over an in-memory set of held card ids, recording each query. */
function memCounter(held: string[]) {
  const calls: string[] = [];
  const counter: HoldingsCounter = {
    async held(ids) {
      calls.push("held");
      return new Set(ids.filter((id) => held.includes(id)));
    },
    async count() {
      calls.push("count");
      return new Set(held).size;
    },
  };
  return { counter, calls };
}
const ids = (n: number, prefix = "c") => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

// ── The numbers ────────────────────────────────────────────────────────────

test("the limits are 10 watched cards and 50 portfolio cards, and the refusal is a structured 402", () => {
  assert.equal(FREE_WATCHLIST_LIMIT, 10);
  assert.equal(FREE_PORTFOLIO_LIMIT, 50);
  assert.equal(FREE_LIMIT_STATUS, 402);
  const b = freeLimitBody("watchlist", 10);
  assert.deepEqual({ ...b, error: undefined }, { error: undefined, code: "free_limit", kind: "watchlist", limit: 10, count: 10 });
  assert.match(b.error, /10 cards, the free limit/);
  assert.match(freeLimitBody("portfolio", 64).error, /64 cards in your portfolio — over the free limit of 50, and you keep all of them/);
  assert.deepEqual(parseFreeLimit(JSON.parse(JSON.stringify(b))), b, "survives the JSON round trip");
  for (const bad of [null, {}, { code: "free_limit", kind: "other" }, { error: "x" }]) assert.equal(parseFreeLimit(bad), null);
});

// ── The check: under / at / over, grandfathering, paid ─────────────────────

test("under the limit a new card is allowed; at the limit it is refused", async () => {
  const under = memCounter(ids(9));
  const u = await checkFreeAllowance(under.counter, "watchlist", ["new"], false);
  assert.deepEqual(u, { allowed: ["new"], blocked: [], count: 9, limit: 10 });

  const at = memCounter(ids(10));
  const a = await checkFreeAllowance(at.counter, "watchlist", ["new"], false);
  assert.deepEqual(a.allowed, []);
  assert.deepEqual(a.blocked, ["new"]);
  assert.equal(a.count, 10);
});

test("grandfathered: an account over the limit keeps everything, may re-add a card it has, and is refused only a new one", async () => {
  const over = memCounter(ids(64));
  // Re-adding (more copies, another market/condition) a card already held:
  // allowed, and not even counted — the count query never runs.
  const again = await checkFreeAllowance(over.counter, "portfolio", ["c3"], false);
  assert.deepEqual(again.allowed, ["c3"]);
  assert.deepEqual(again.blocked, []);
  assert.deepEqual(over.calls, ["held"], "a held card costs one scoped read, no count");
  // A new card: refused, with the real count (64), not the limit.
  const fresh = await checkFreeAllowance(over.counter, "portfolio", ["new"], false);
  assert.deepEqual(fresh.blocked, ["new"]);
  assert.equal(fresh.count, 64);
  assert.equal(freeLimitBody("portfolio", fresh.count!).count, 64);
});

test("any paid tier is unlimited, and is never counted", async () => {
  const m = memCounter(ids(500));
  const r = await checkFreeAllowance(m.counter, "watchlist", ["new", "new2"], true);
  assert.deepEqual(r.allowed, ["new", "new2"]);
  assert.deepEqual(r.blocked, []);
  assert.deepEqual(m.calls, [], "no query at all for a paying account");
});

test("an import fills the remaining allowance in paste order and reports the rest", async () => {
  const m = memCounter(ids(47));
  const pasted = ["n1", "c5", "n2", "n3", "n4", "n5", "n1"];
  const r = await checkFreeAllowance(m.counter, "portfolio", pasted, false);
  assert.deepEqual(r.allowed, ["n1", "c5", "n2", "n3"], "the held card always, then 3 new cards (47 → 50), de-duplicated");
  assert.deepEqual(r.blocked, ["n4", "n5"]);
});

test("the client pre-check and the quiet counter", () => {
  const held = new Set(ids(10));
  assert.equal(wouldHitFreeLimit("watchlist", { paid: false, held, cardId: "new" }), true);
  assert.equal(wouldHitFreeLimit("watchlist", { paid: false, held, cardId: "c1" }), false, "a card already watched");
  assert.equal(wouldHitFreeLimit("watchlist", { paid: true, held, cardId: "new" }), false);
  assert.equal(wouldHitFreeLimit("watchlist", { paid: false, held: new Set(ids(9)), cardId: "new" }), false);
  // No nagging before 7 of 10 (40 of 50); never for a paid account.
  assert.equal(showFreeLimitCounter("watchlist", 6, false), false);
  assert.equal(showFreeLimitCounter("watchlist", 7, false), true);
  assert.equal(showFreeLimitCounter("watchlist", 12, true), false);
  assert.equal(showFreeLimitCounter("portfolio", 39, false), false);
  assert.equal(showFreeLimitCounter("portfolio", 40, false), true);
  assert.equal(freeLimitCounterText("watchlist", 8), "8 of 10 free");
  assert.equal(freeLimitCounterText("watchlist", 14), "14 cards · free accounts add up to 10");
});

// ── The database side, against a stub client ──────────────────────────────

function stubDb(opts: { rows?: { cardId: string }[]; distinct?: number; owner?: object | null } = {}) {
  const calls: { op: string; args: unknown }[] = [];
  const findMany = async (args: unknown) => {
    calls.push({ op: "findMany", args });
    return opts.rows ?? [];
  };
  const db = {
    priceAlert: { findMany },
    collectionCard: { findMany },
    user: {
      findUnique: async (args: unknown) => {
        calls.push({ op: "user", args });
        return opts.owner ?? null;
      },
    },
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ op: "raw", args: { sql: strings.join("?"), values } });
      return [{ n: opts.distinct ?? 0 }];
    },
  };
  return { db, calls };
}

test("watch counting is scoped to the address (and the account), and counted in Postgres", async () => {
  const s = stubDb({ rows: [], distinct: 3 });
  const h = watchHoldings(s.db as never, { email: "a@x.com", userId: "u1" });
  await h.held(["k1", "k2"]);
  const fm = s.calls[0].args as { where: unknown; take: number };
  assert.deepEqual(fm.where, { AND: [{ OR: [{ email: "a@x.com" }, { userId: "u1" }] }, { cardId: { in: ["k1", "k2"] } }] });
  assert.equal(fm.take, 12, "bounded: one row per market per card at most");
  assert.equal(await h.count(), 3);
  const raw = s.calls[1].args as { sql: string; values: unknown[] };
  assert.match(raw.sql, /SELECT COUNT\(DISTINCT "cardId"\)::int AS n FROM "PriceAlert" WHERE "email" = \? OR "userId" = \?/);
  assert.deepEqual(raw.values, ["a@x.com", "u1"]);

  // Anonymous: the address alone.
  const anon = stubDb();
  const ah = watchHoldings(anon.db as never, { email: "b@x.com" });
  await ah.held(["k1"]);
  await ah.count();
  assert.deepEqual((anon.calls[0].args as { where: unknown }).where, { AND: [{ email: "b@x.com" }, { cardId: { in: ["k1"] } }] });
  assert.match((anon.calls[1].args as { sql: string }).sql, /FROM "PriceAlert" WHERE "email" = \?$/);
});

test("portfolio counting is scoped to the account and counts distinct cards, not rows or copies", async () => {
  const s = stubDb({ rows: [{ cardId: "k1" }, { cardId: "k1" }], distinct: 50 });
  const h = portfolioHoldings(s.db as never, "u1");
  assert.deepEqual([...(await h.held(["k1", "k2"]))], ["k1"]);
  assert.deepEqual((s.calls[0].args as { where: unknown }).where, { userId: "u1", cardId: { in: ["k1", "k2"] } });
  assert.equal(await h.count(), 50);
  assert.match((s.calls[1].args as { sql: string }).sql, /COUNT\(DISTINCT "cardId"\)::int AS n FROM "CollectionCard" WHERE "userId" = \?/);

  const at = await portfolioAllowance(stubDb({ distinct: 50 }).db as never, free, ["new"]);
  assert.deepEqual(at.blocked, ["new"], "the 51st card");
  const grand = await portfolioAllowance(stubDb({ rows: [{ cardId: "have" }], distinct: 80 }).db as never, free, ["have"]);
  assert.deepEqual(grand.allowed, ["have"], "more copies of a card already held");
  const paid = stubDb({ distinct: 500 });
  assert.deepEqual((await portfolioAllowance(paid.db as never, plus, ["new"])).allowed, ["new"]);
  assert.equal(paid.calls.length, 0);
  assert.deepEqual((await portfolioAllowance(stubDb({ distinct: 1 }).db as never, admin, ["new"])).allowed, ["new"], "admins count as paid");
});

test("a lapsed subscriber over the limit is grandfathered like anyone else", async () => {
  const keep = await watchAllowance(stubDb({ rows: [{ cardId: "have" }], distinct: 40 }).db as never, { email: "a@x.com", account: lapsed, cardIds: ["have"] });
  assert.deepEqual(keep.allowed, ["have"]);
  const add = await watchAllowance(stubDb({ distinct: 40 }).db as never, { email: "a@x.com", account: lapsed, cardIds: ["new"] });
  assert.deepEqual(add.blocked, ["new"]);
  assert.equal(add.count, 40);
});

test("anonymous email-only watches are capped per address too — no way around the limit", async () => {
  const s = stubDb({ distinct: FREE_WATCHLIST_LIMIT, owner: null });
  const r = await watchAllowance(s.db as never, { email: "anon@x.com", account: null, cardIds: ["new"] });
  assert.deepEqual(r.blocked, ["new"]);
  assert.ok(s.calls.some((c) => c.op === "user"), "at the limit, the address is checked for a paying account");
  // Under the limit the owner lookup never runs.
  const under = stubDb({ distinct: 3 });
  await watchAllowance(under.db as never, { email: "anon@x.com", account: null, cardIds: ["new"] });
  assert.ok(!under.calls.some((c) => c.op === "user"));
  // An address that belongs to a paying account is unlimited through either door.
  const member = stubDb({ distinct: 30, owner: { isAdmin: false, premiumUntil: PAID_UNTIL, premiumTier: "plus", premiumTierFloor: null } });
  const m = await watchAllowance(member.db as never, { email: "paid@x.com", account: null, cardIds: ["new"] });
  assert.deepEqual(m.allowed, ["new"]);
  // A signed-in free account is not re-checked by address.
  const acct = stubDb({ distinct: 10, owner: { isAdmin: true, premiumUntil: null } });
  const a = await watchAllowance(acct.db as never, { email: "a@x.com", account: free, cardIds: ["new"] });
  assert.deepEqual(a.blocked, ["new"]);
  assert.ok(!acct.calls.some((c) => c.op === "user"));
});

// ── The routes ─────────────────────────────────────────────────────────────

test("every route that creates a watch or a portfolio card enforces the limit, before writing", () => {
  const watch = code("src/app/api/alerts/watchlist/route.ts");
  const wAt = watch.indexOf("await watchAllowance(prisma, { email: user.email, account: user, cardIds: [card.id] })");
  assert.ok(wAt > 0);
  assert.ok(wAt < watch.indexOf("computeAlertPrices(") && wAt < watch.indexOf("prisma.priceAlert.upsert"), "checked before the price read and the write");
  assert.match(watch, /freeLimitBody\("watchlist", allowance\.count \?\? allowance\.limit\), \{ status: FREE_LIMIT_STATUS \}/);

  const sub = code("src/app/api/alerts/subscribe/route.ts");
  assert.match(sub, /await watchAllowance\(prisma, \{ email, account: userId && me \? me : null, cardIds: cards\.map\(\(c\) => c\.id\) \}\)/);
  assert.match(sub, /const fresh = cards\.filter\(\(c\) => !watched\.has\(c\.id\) && allowedIds\.has\(c\.id\)\);/, "only allowed cards are written");
  assert.ok(sub.indexOf("watchAllowance(") < sub.indexOf("prisma.priceAlert.createMany"));
  assert.match(sub, /status: FREE_LIMIT_STATUS/);

  const coll = code("src/app/api/collection/route.ts");
  assert.match(coll, /await portfolioAllowance\(prisma, user, \[card\.id\]\)/);
  assert.ok(coll.indexOf("portfolioAllowance(") < coll.indexOf("addCopies("));
  assert.match(coll, /freeLimitBody\("portfolio", allowance\.count \?\? allowance\.limit\), \{ status: FREE_LIMIT_STATUS \}/);

  const imp = code("src/app/api/collection/import/route.ts");
  assert.match(imp, /await portfolioAllowance\(prisma, user, \[\.\.\.qtyByCard\.keys\(\)\]\)/);
  assert.match(imp, /for \(const id of allowance\.blocked\) qtyByCard\.delete\(id\);/, "skipped cards are never written");
  assert.match(imp, /limitSkipped: allowance\.blocked\.length/, "and reported");
  assert.ok(imp.indexOf("portfolioAllowance(") < imp.indexOf("addCopies("));
});

test("there is no other path that creates a watch or a portfolio card", () => {
  const walk = (d: string): string[] =>
    readdirSync(join(ROOT, d)).flatMap((n) => {
      const p = `${d}/${n}`;
      return statSync(join(ROOT, p)).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
    });
  const creators = walk("src").filter((f) =>
    /\b(priceAlert|collectionCard)\.(create|createMany|upsert)\(|INSERT INTO "(PriceAlert|CollectionCard)"/.test(read(f)),
  );
  assert.deepEqual(creators.sort(), [
    "src/app/api/alerts/subscribe/route.ts",
    "src/app/api/alerts/watchlist/route.ts",
    "src/lib/collection-add.ts", // collectionRowStore: called only by the two collection routes above
  ]);
  const rowStoreUsers = walk("src").filter((f) => /collectionRowStore\(/.test(read(f)) && f !== "src/lib/collection-add.ts");
  assert.deepEqual(rowStoreUsers.sort(), ["src/app/api/collection/import/route.ts", "src/app/api/collection/route.ts"]);
});

// ── The upgrade prompt, where the limit is hit ─────────────────────────────

test("the at-the-limit panel sells Plus from the add that hit the limit, on every add surface", () => {
  for (const s of LIMIT_SURFACES) assert.ok(isPremiumSurface(s), s);
  const panel = code("src/components/FreeLimitPanel.tsx");
  assert.match(panel, /<PremiumButton tier="plus" surface=\{`limit:\$\{kind\}`\} \/>/);
  for (const [f, re] of [
    ["src/components/PriceWatchButton.tsx", /watch\(cardId, country, \{ onLimit: setLimit \}\)[\s\S]*<FreeLimitPopover/],
    ["src/components/PriceDropAlertCta.tsx", /onLimit: setLimit[\s\S]*<FreeLimitPanel kind="watchlist"/],
    ["src/components/PriceAlertModal.tsx", /res\.status === FREE_LIMIT_STATUS[\s\S]*<FreeLimitPanel kind="watchlist"/],
    ["src/components/QuickView.tsx", /res\.status === FREE_LIMIT_STATUS[\s\S]*<FreeLimitPanel kind="portfolio"/],
    ["src/components/MyCollection.tsx", /res\.status === FREE_LIMIT_STATUS[\s\S]*<FreeLimitPanel kind="portfolio"[\s\S]*result\.limitSkipped[\s\S]*<FreeLimitPanel kind="portfolio"/],
  ] as const) {
    assert.match(code(f), re, f);
  }
  // The shared watch() pre-checks from what the page already holds, and hands
  // a 402 from the route to the same callback.
  const hook = code("src/lib/use-watchlist.ts");
  assert.match(hook, /wouldHitFreeLimit\("watchlist", \{ paid: me\.premium, held: watched, cardId \}\)/);
  assert.match(hook, /res\?\.status === FREE_LIMIT_STATUS/);
  // The quiet counters.
  assert.match(code("src/components/Watchlist.tsx"), /showFreeLimitCounter\("watchlist", watchedCards, premium\)/);
  assert.match(code("src/components/MyCollection.tsx"), /showFreeLimitCounter\("portfolio", distinctCards, premium\)/);
});

// ── Best Basket leads with the list's own saving, in money ─────────────────

test("the basket saving line: real money at or above $1, no saving claim below it", () => {
  const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;
  assert.equal(BASKET_SAVING_MIN_CENTS, 100);
  const line = basketSavingPitch(1420, fmt, { plusMember: false, priceLabel: PREMIUM_PRICE_LABEL })!;
  assert.equal(
    line,
    `The store-by-store plan saves you $14.20 on this list compared with buying each card's cheapest copy separately. Unlock it for ${PREMIUM_PRICE_LABEL}.`,
  );
  assert.match(basketSavingPitch(100, fmt, { plusMember: false, priceLabel: "x" })!, /\$1\.00/);
  const upgrade = basketSavingPitch(1420, fmt, { plusMember: true, priceLabel: PREMIUM_PRICE_LABEL })!;
  assert.match(upgrade, /saves you \$14\.20[\s\S]*Upgrade to Premium to unlock it\./, "Plus members see the same, as an upgrade");
  for (const small of [99, 40, 0, -250, NaN]) {
    assert.equal(basketSavingPitch(small, fmt, { plusMember: false, priceLabel: "x" }), null, `${small}: no saving claim`);
  }
  const ui = code("src/components/BestBasket.tsx");
  assert.match(ui, /basketSavingPitch\(r\.savedCents, fmt, \{ plusMember: premium && tier === "plus", priceLabel: PREMIUM_PRICE_LABEL \}\)/, "the user's own computed saving, nothing else");
  assert.match(ui, /<PremiumButton surface="limit:basket" \/>/);
});

// ── No popup or header upsells ─────────────────────────────────────────────

test("the signed-in Premium slide-in is gone and nothing mounts it; the signed-out popup stays", () => {
  assert.ok(!existsSync(join(ROOT, "src/components/PremiumSlideIn.tsx")));
  assert.ok(!existsSync(join(ROOT, "src/components/PremiumPitchPanel.tsx")));
  assert.ok(!existsSync(join(ROOT, "src/app/api/premium/nudge/route.ts")));
  const layout = code("src/app/layout.tsx");
  assert.doesNotMatch(layout, /PremiumSlideIn/);
  assert.match(layout, /<SignupPromoPopup providers=\{enabledProviders\(\)\} \/>/, "the free-account popup stays: the free limits are the funnel");
  const walk = (d: string): string[] =>
    readdirSync(join(ROOT, d)).flatMap((n) => {
      const p = `${d}/${n}`;
      return statSync(join(ROOT, p)).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
    });
  for (const f of walk("src")) assert.doesNotMatch(code(f), /PremiumSlideIn|PremiumPitchPanel/, `${f} still references the slide-in`);
});

test("the header, rail and account menu link to /premium plainly — no gold Premium CTA", () => {
  for (const f of ["src/components/Navbar.tsx", "src/components/SideNav.tsx", "src/components/UserMenu.tsx"]) {
    const c = code(f);
    const links = [...c.matchAll(/<PremiumNavLink[\s\S]*?<\/PremiumNavLink>/g)].map((m) => m[0]);
    assert.ok(links.length > 0, `${f}: /premium stays reachable`);
    for (const l of links) {
      assert.doesNotMatch(l, /text-gold|border-gold|bg-gold|premium-shimmer|✦/, `${f}: ${l.slice(0, 80)}`);
      assert.match(l, />\s*(Pricing|<NavIcon[^>]*\/>\s*<span[^>]*>Pricing<\/span>)\s*</, `${f}: labelled Pricing`);
    }
  }
  // The tool walls stay: they are where people hit a limit.
  for (const f of ["src/app/tools/deal-finder/page.tsx", "src/app/tools/rising/page.tsx", "src/app/tools/demand/page.tsx"]) {
    assert.match(read(f), /<PremiumButton|PremiumGate|surface="gate:/, `${f} keeps its wall`);
  }
});

// ── Copy ───────────────────────────────────────────────────────────────────

test("every tier surface quotes the limits from the constants, and price comparison stays free", () => {
  const row = (f: string) => TIER_COMPARISON.find((r) => r.feature === f)!;
  assert.deepEqual(
    { ...row("Watchlist & new-low alerts") },
    { feature: "Watchlist & new-low alerts", account: `${FREE_WATCHLIST_LIMIT} cards`, plus: "Unlimited", premium: "Unlimited" },
  );
  const port = row("Portfolio — value, P&L, CSV & replacement cost");
  assert.equal(port.account, `${FREE_PORTFOLIO_LIMIT} cards`);
  assert.equal(port.plus, "Unlimited");
  assert.equal(port.premium, "Unlimited");
  const compare = row("Compare prices across every store + eBay");
  assert.deepEqual([compare.account, compare.plus, compare.premium], [true, true, true], "price comparison: free for everyone");

  const page = read("src/app/premium/page.tsx");
  assert.match(page, /q: "What happens to cards I already track\?"/);
  assert.match(page, /You keep them all/);
  assert.match(page, /free for everyone, with no limit/);
  for (const f of [
    "src/components/PremiumPricingCards.tsx",
    "src/app/premium/page.tsx",
    "src/lib/articles.ts",
    "src/app/llms.txt/route.ts",
    "src/lib/email.ts",
    "src/app/alerts/page.tsx",
  ]) {
    assert.match(read(f), /FREE_WATCHLIST_LIMIT/, `${f} quotes the watchlist limit from the constant`);
    assert.doesNotMatch(code(f), /\b(10|ten) (watched )?cards\b|\b50 (portfolio )?cards\b/i, `${f} hand-types a limit`);
  }
  assert.equal(PREMIUM_COPY_VERSION, "limits-2026-09-28");
});

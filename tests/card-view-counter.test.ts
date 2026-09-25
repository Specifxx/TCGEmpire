import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isBotUserAgent, shouldCountCardView, VIEW_IP_RATE_LIMIT, VIEW_IP_RATE_WINDOW_MS, VIEW_RATE_LIMIT, VIEW_RATE_WINDOW_MS } from "../src/lib/card-views";
import { rateLimit } from "../src/lib/rate-limit";
import { POST } from "../src/app/api/card/[id]/view/route";

// ─────────────────────────────────────────────────────────────────────────────
// The demand counter (Card.searchCount / viewCount) feeds Rising Cards and the
// free "Most searched this week" strip on /movers. Until 2026-09-25 it was an
// unauthenticated POST with no limit: a curl loop could put any card at #1.
// These pin the two guards (lib/card-views.ts) — and never let a test reach
// the database: every route call below returns before the write.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const FIREFOX = "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0";
const ANDROID_WEBVIEW = "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36";

test("crawlers, HTTP libraries and an empty user agent are bots; real browsers are not", () => {
  for (const ua of [
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    "facebookexternalhit/1.1",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/129.0.0.0 Safari/537.36",
    "curl/8.5.0",
    "python-requests/2.32.3",
    "Go-http-client/2.0",
    "node",
    "Wget/1.21",
    "",
    null,
    undefined,
  ]) {
    assert.equal(isBotUserAgent(ua), true, `bot: ${String(ua)}`);
  }
  for (const ua of [CHROME, IPHONE, FIREFOX, ANDROID_WEBVIEW]) assert.equal(isBotUserAgent(ua), false, `browser: ${ua}`);
});

function memoryStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), size: () => m.size };
}

test("a browser counts each card once per kind per day", () => {
  const s = memoryStorage();
  const day = new Date(2026, 8, 25, 10);
  assert.equal(shouldCountCardView("card-1", "view", s, day), true, "first view counts");
  assert.equal(shouldCountCardView("card-1", "view", s, day), false, "a reload does not");
  assert.equal(shouldCountCardView("card-1", "search", s, day), true, "a search pick is its own kind");
  assert.equal(shouldCountCardView("card-1", "search", s, new Date(2026, 8, 25, 23, 59)), false, "…once a day");
  assert.equal(shouldCountCardView("card-2", "view", s, day), true, "another card counts");
  assert.equal(shouldCountCardView("card-1", "view", s, new Date(2026, 8, 26, 0, 1)), true, "the next day counts again");
  assert.equal(s.size(), 1, "one storage entry, reset daily — storage never grows past a day's cards");
});

test("storage trouble fails open: the view is sent and the server limit is the backstop", () => {
  const throwing = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => { throw new Error("QuotaExceeded"); } };
  assert.equal(shouldCountCardView("c", "view", throwing), true);
  assert.equal(shouldCountCardView("c", "view", null), true);
  const corrupt = { getItem: () => "{not json", setItem: () => {} };
  assert.equal(shouldCountCardView("c", "view", corrupt), true);
});

const req = (id: string, ua: string | null, ip = "203.0.113.7", search = false) =>
  new Request(`https://riftcompare.test/api/card/${id}/view${search ? "?source=search" : ""}`, {
    method: "POST",
    headers: { ...(ua != null ? { "user-agent": ua } : {}), "x-forwarded-for": ip },
  });

test("the view route answers bots with a 204 and never counts them", async () => {
  const res = await POST(req("some-card", "Mozilla/5.0 (compatible; Googlebot/2.1)"), { params: { id: "some-card" } });
  assert.equal(res.status, 204);
  const empty = await POST(req("some-card", null), { params: { id: "some-card" } });
  assert.equal(empty.status, 204, "no user agent is not a browser");
});

test("the view route rate-limits per IP and card", async () => {
  // Fill this IP+card's bucket directly (same module instance the route uses),
  // so the request under test is the one over the limit and returns before the
  // database write.
  const ip = "198.51.100.23";
  const id = "rate-limited-card";
  for (let i = 0; i < VIEW_RATE_LIMIT; i++) assert.ok(rateLimit(`view:${ip}:${id}`, VIEW_RATE_LIMIT, VIEW_RATE_WINDOW_MS).ok);
  const res = await POST(req(id, CHROME, ip, true), { params: { id } });
  assert.equal(res.status, 429);
  assert.ok(Number(res.headers.get("retry-after")) > 0);

  const src = code("src/app/api/card/[id]/view/route.ts");
  assert.match(src, /rateLimit\(`view:\$\{clientIp\(req\)\}:\$\{params\.id\}`, VIEW_RATE_LIMIT, VIEW_RATE_WINDOW_MS\)/);
  assert.ok(src.indexOf("isBotUserAgent(") < src.indexOf("rateLimit("), "bots are turned away before they touch the limiter");
  assert.ok(src.indexOf("rateLimit(") < src.indexOf("prisma.card.updateMany"), "the limit is checked before the write");
  assert.ok(VIEW_RATE_LIMIT >= 2, "one search pick plus one view of the same card must both count");
});

test("one IP can't grow the shared limiter with made-up ids: a per-IP cap runs first, and non-card ids are refused", async () => {
  // Review, 2026-09-25: every POST with a new id added a 6-hour bucket.
  const ip = "198.51.100.77";
  for (let i = 0; i < VIEW_IP_RATE_LIMIT; i++) rateLimit(`view-ip:${ip}`, VIEW_IP_RATE_LIMIT, VIEW_IP_RATE_WINDOW_MS);
  const res = await POST(req("never-seen-before", CHROME, ip, true), { params: { id: "never-seen-before" } });
  assert.equal(res.status, 429, "over the per-IP cap: refused before a per-card bucket is made");
  const src = code("src/app/api/card/[id]/view/route.ts");
  assert.ok(src.indexOf("`view-ip:${clientIp(req)}`") < src.indexOf("`view:${clientIp(req)}:${params.id}`"), "per-IP first");
  assert.ok(VIEW_IP_RATE_LIMIT * (VIEW_RATE_WINDOW_MS / VIEW_IP_RATE_WINDOW_MS) <= 2_000, "bounded per-card buckets per IP");
  // An id with characters no card id or slug has is a no-op 204.
  const odd = await POST(req("x", CHROME, "198.51.100.78", true), { params: { id: "../../etc" } });
  assert.equal(odd.status, 204);
});

test("every client beacon goes through the once-a-day guard", () => {
  for (const f of ["src/components/CardViewBeacon.tsx", "src/components/QuickView.tsx", "src/components/SearchBar.tsx"]) {
    const src = code(f);
    assert.match(src, /import \{[^}]*sendCardView[^}]*\} from "@\/lib\/card-views";/, `${f} must send through sendCardView`);
    assert.doesNotMatch(src, /\/view(\?source=search)?`, \{ method: "POST"/, `${f} must not POST to the view route directly`);
  }
});

test("a Trending-row click counts as a view, not a search", () => {
  const src = code("src/components/SearchBar.tsx");
  assert.match(src, /trackCardView\(card, resultType === "trending" \? "view" : "search"\)/, "the shared click path picks the kind by row type");
  // The modifier-click branch of each row: Trending → view, typed result → search.
  const trending = src.slice(src.indexOf("visibleTrending.map("), src.indexOf("visibleRecent.map("));
  assert.match(trending, /trackCardView\(c, "view"\)/);
  assert.doesNotMatch(trending, /trackCardView\(c, "search"\)/);
  assert.match(src, /trackCardView\(r, "search"\)/);
});

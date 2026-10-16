import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isGameKey } from "../src/lib/games";
import { NAV_GROUPS } from "../src/components/nav-groups";

// The 2026-10-16 clean-up (owner: "find the top 10 most useless features and
// delete all of them"; DECISIONS.md, "Ten features nobody used"). Each one is
// deleted, not merely unlinked, and every public URL it had 301s somewhere live.

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const GONE = [
  "src/app/games/price-check/page.tsx",
  "src/app/games/zoomed/page.tsx",
  "src/app/games/card-smash/page.tsx",
  "src/app/games/sealed-bid/page.tsx",
  "src/app/api/games/sealed-bid/route.ts",
  "src/app/api/discord/interactions/route.ts",
  "src/app/api/cron/discord-daily/route.ts",
  "scripts/register-discord-commands.ts",
  "src/app/api/listings/route.ts",
  "src/components/SellForm.tsx",
  "src/lib/listings.ts",
  "src/app/api/shopify/cart/route.ts",
  "src/lib/shopify.ts",
  "src/app/api/mcp/route.ts",
  "src/app/.well-known/mcp.json/route.ts",
  "src/app/stores/consulting/page.tsx",
  "src/app/api/stores/consulting/route.ts",
  "src/lib/consulting.ts",
  "src/app/community/page.tsx",
];

test("the ten retired features are deleted", () => {
  for (const p of GONE) assert.ok(!existsSync(join(ROOT, p)), `${p} should be gone`);
  for (const k of ["price-check", "zoomed", "card-smash", "sealed-bid"]) assert.ok(!isGameKey(k), `${k} left the leaderboard registry`);
});

test("every retired page 301s to a live one", () => {
  const cfg = read("next.config.js");
  const want: Record<string, string> = {
    "/games/price-check": "/games",
    "/games/zoomed": "/games",
    "/games/card-smash": "/games",
    "/games/sealed-bid": "/games",
    "/stores/consulting": "/stores",
    "/stores/consulting/confirmed": "/stores",
    "/community": "/",
  };
  for (const [from, to] of Object.entries(want)) {
    assert.ok(cfg.includes(`{ source: "${from}", destination: "${to}", permanent: true }`), `${from} → ${to}`);
  }
});

test("nothing still links or lists a retired page", () => {
  const hrefs = NAV_GROUPS.flatMap((g) => g.links).map((l) => l.href);
  const dead = /^\/(games\/(price-check|zoomed|card-smash|sealed-bid)|stores\/consulting|community)$/;
  assert.deepEqual(hrefs.filter((h) => dead.test(h)), []);
  for (const f of ["src/lib/sitemap-sections.ts", "src/lib/static-page-dates.ts", "src/app/games/page.tsx", "src/app/stores/page.tsx", "src/app/about/page.tsx", "src/app/terms/page.tsx", "src/app/llms.txt/route.ts"]) {
    assert.doesNotMatch(read(f), /\/games\/(price-check|zoomed|card-smash|sealed-bid)\b|\/stores\/consulting|"\/community"|\/api\/mcp/, f);
  }
  assert.ok(!JSON.parse(read("vercel.json")).crons.some((c: { path: string }) => c.path === "/api/cron/discord-daily"));
});

test("the Stripe webhook no longer settles consulting bookings but keeps Premium", () => {
  const hook = read("src/app/api/marketplace/stripe/webhook/route.ts");
  assert.doesNotMatch(hook, /consultBookingPaid|@\/lib\/consulting/);
  assert.match(hook, /await premiumStarted\(session\)/);
});

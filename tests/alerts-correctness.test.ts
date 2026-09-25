import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { watchBaseline } from "../src/lib/watch-baseline";

// ─────────────────────────────────────────────────────────────────────────────
// Alert correctness, shipped with the 2026-09-25 premium lineup: the numbers
// and promises the paid target alert is built on.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

test("schema: targetCents and startPriceCents are additive, nullable PriceAlert columns", () => {
  const schema = read("prisma/schema.prisma");
  const model = schema.slice(schema.indexOf("model PriceAlert {"), schema.indexOf("model RetailerPrice {"));
  assert.match(model, /\n\s*targetCents\s+Int\?\n/);
  assert.match(model, /\n\s*startPriceCents\s+Int\?\n/);
});

test("'watching from' is the start price, in the watch's own currency; the delta only for the viewer's market", () => {
  // A US watch seen from the US: start price and a real change.
  assert.deepEqual(watchBaseline({ market: "US", startPriceCents: 1000, lastPriceCents: 800 }, "US", 900), {
    label: "watching from",
    text: "US$10.00",
    delta: -10,
  });
  // An AU watch seen from the US: A$, and NO delta against a US$ price.
  assert.deepEqual(watchBaseline({ market: "AU", startPriceCents: 5000, lastPriceCents: 5000 }, "US", 3000), {
    label: "watching from",
    text: "A$50.00",
    delta: null,
  });
  // A row from before the column: last-checked price, labelled as such.
  assert.equal(watchBaseline({ market: "US", startPriceCents: null, lastPriceCents: 700 }, "US", 700).label, "at the last check");
  assert.equal(watchBaseline({ market: "US", startPriceCents: null, lastPriceCents: null }, "US", 700).text, null);
  assert.equal(watchBaseline({ market: "US", startPriceCents: 1000, lastPriceCents: 1000 }, "US", null).delta, null, "no current price, no fake 0%");
  // The cron never writes the start price.
  assert.doesNotMatch(read("src/lib/price-alerts.ts"), /startPriceCents/);
});

test("both creation paths write startPriceCents once; re-watching never rewrites it", () => {
  const sub = code("src/app/api/alerts/subscribe/route.ts");
  assert.match(sub, /lastPriceCents: price,\s*startPriceCents: price,/);
  const wl = code("src/app/api/alerts/watchlist/route.ts");
  assert.match(wl, /create: \{[\s\S]*lastPriceCents: price,\s*startPriceCents: price,/);
  const update = /update:\s*\{([^}]*)\}/.exec(wl)?.[1] ?? "";
  assert.ok(!update.includes("startPriceCents"), "adopting a row keeps its own start price");
});

test("anonymous confirmations: new addresses only, under a global daily cap", () => {
  const sub = code("src/app/api/alerts/subscribe/route.ts");
  assert.match(sub, /if \(result\.count > 0 && !existing && \(await confirmationsUnderDailyCap\(\)\)\)/);
  // Global = the database, not the per-instance rate limiter.
  const cap = sub.slice(sub.indexOf("async function confirmationsUnderDailyCap"));
  assert.match(cap, /prisma\.priceAlert\s*\.count\(\{ where: \{ userId: null, createdAt: \{ gte: since \} \} \}\)/);
  assert.match(sub, /const CONFIRMATION_DAILY_CAP = 30;/);
  assert.match(cap, /\.catch\(\(\) => Number\.POSITIVE_INFINITY\)/, "a failed count sends nothing");
  // Route files may export only handlers and config.
  assert.doesNotMatch(sub, /export const CONFIRMATION_DAILY_CAP/);
  // The confirmation no longer promises an email on every drop.
  const email = read("src/lib/email.ts");
  const conf = email.slice(email.indexOf("export async function sendAlertConfirmationEmail"), email.indexOf("// ─── Weekly newsletter digest"));
  assert.doesNotMatch(conf, /whenever the price drops/);
  assert.match(conf, /At most one email a week/);
});

test("the header watchlist fetch is ids-only; the watchlist itself keeps the full payload", () => {
  assert.match(read("src/lib/use-watchlist.ts"), /fetch\("\/api\/alerts\/watchlist\?ids=1"/);
  assert.match(read("src/components/Watchlist.tsx"), /fetch\("\/api\/alerts\/watchlist", \{ cache: "no-store" \}\)/);
  const route = code("src/app/api/alerts/watchlist/route.ts");
  const ids = route.slice(route.indexOf('searchParams.get("ids") === "1"'), route.indexOf("const country = getCountry()"));
  assert.match(ids, /select: \{ cardId: true \}/, "ids mode selects the card id alone");
  assert.match(ids, /take: 500/);
  assert.match(ids, /where: \{ userId: user\.id \}/);
  assert.doesNotMatch(ids, /cardTileSelect/);
  // The full shape carries what the rows need.
  assert.match(route, /startPriceCents: true,/);
  assert.match(route, /targetCents: true,/);
});

test("/alerts: no shipping claim, the real weekly cadence, and a Plus section quoting the shared limit", () => {
  const page = code("src/app/alerts/page.tsx");
  assert.doesNotMatch(page, /shipping included|including shipping|lowest live total/i);
  assert.match(page, /At most one email a week, only when a card hits a new low/);
  assert.doesNotMatch(page, /your very first alert on a card arrives as soon as it drops/, "the cap is per address, not per card");
  assert.match(page, /import \{ PLUS_TARGET_ALERT_LIMIT \} from "@\/lib\/alert-limits"/);
  assert.match(page, /on up to \{PLUS_TARGET_ALERT_LIMIT\} cards/);
  assert.match(page, /Plus is ad-free/, "every surface that describes Plus says it is ad-free");
  assert.match(page, /Can I watch a card with no price yet\?/);
});

test("paid runs follow each price import: a non-fatal GET with the cron secret", () => {
  const wf = read(".github/workflows/refresh-prices.yml");
  const revalidate = wf.indexOf("- name: Revalidate site pages");
  const paid = wf.indexOf("- name: Paid price alerts");
  assert.ok(revalidate > 0 && paid > revalidate, "the paid run comes after the revalidation step");
  const step = wf.slice(paid);
  assert.match(step, /if: always\(\)/);
  assert.match(step, /CRON_SECRET: \$\{\{ secrets\.CRON_SECRET \}\}/);
  assert.match(step, /curl -s --max-time 120 "\$SITE_URL\/api\/cron\/price-alerts\?scope=paid" -H "Authorization: Bearer \$CRON_SECRET" \|\| true/);
  // The route is GET, authenticates that header, and maps the query to the scope.
  const route = read("src/app/api/cron/price-alerts/route.ts");
  assert.match(route, /export async function GET\(req: Request\)/);
  assert.match(route, /auth !== `Bearer \$\{secret\}`/);
  assert.match(route, /searchParams\.get\("scope"\) === "paid" \? "paid" : "all"/);
  assert.match(route, /runPriceAlerts\(\{\}, \{ scope \}\)/);
  // vercel.json keeps its single daily run — the 'all' run.
  const crons = JSON.parse(read("vercel.json")).crons as { path: string }[];
  assert.deepEqual(crons.filter((c) => c.path.startsWith("/api/cron/price-alerts")).map((c) => c.path), ["/api/cron/price-alerts"]);
});

test("the target field: market currency, PATCH on blur, Plus count; free sees it disabled beside the Plus gate", () => {
  const field = code("src/components/TargetPriceField.tsx");
  assert.match(field, /currencyOf\(market as Country\)/);
  assert.match(field, /method: "PATCH"/);
  assert.match(field, /body: JSON\.stringify\(\{ market, targetCents: cents \}\)/);
  assert.match(field, /onBlur=\{/);
  assert.match(field, /clampTargetCents\(parsed\)/);
  assert.match(field, /targetAlertLimit\(tier\)/);
  assert.match(field, /\{usedNow\} of \{finiteLimit\} used/);
  assert.match(field, /const disabled = !premium \|\|/);
  assert.match(
    field,
    /<PremiumButton\s+tier="plus"\s+surface="gate:target-alert"[\s\S]*?>\s*Set your own price with Plus\s*<\/PremiumButton>/,
  );
  assert.match(field, /Notify me at/);
  // Both surfaces render it.
  assert.match(read("src/components/Watchlist.tsx"), /<TargetPriceField/);
  assert.match(read("src/components/PriceAlertModal.tsx"), /<TargetPriceField/);
});

test("the watchlist hands itself to Best Basket", () => {
  const wl = read("src/components/Watchlist.tsx");
  assert.match(wl, /href="\/tools\/best-basket\?source=watchlist"/);
  assert.match(wl, /Price my watchlist, delivered →/);
});

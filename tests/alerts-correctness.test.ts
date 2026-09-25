import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { watchBaseline } from "../src/lib/watch-baseline";
import { CONFIRMATION_DAILY_CAP, claimConfirmationSlot, confirmationKey, type ConfirmationDb } from "../src/lib/alert-confirmations";

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
  // The cron READS the start price (the email's "you started watching at")
  // but never writes it — tests/price-alerts-first-price.test.ts checks its
  // writes; here, no assignment to it anywhere in the source.
  assert.doesNotMatch(code("src/lib/price-alerts.ts"), /data\.startPriceCents|startPriceCents\s*=[^=]/);
});

test("both creation paths write startPriceCents once; re-watching never rewrites it", () => {
  const sub = code("src/app/api/alerts/subscribe/route.ts");
  assert.match(sub, /lastPriceCents: price,\s*startPriceCents: price,/);
  const wl = code("src/app/api/alerts/watchlist/route.ts");
  assert.match(wl, /create: \{[\s\S]*lastPriceCents: price,\s*startPriceCents: price,/);
  const update = /update:\s*\{([^}]*)\}/.exec(wl)?.[1] ?? "";
  assert.ok(!update.includes("startPriceCents"), "adopting a row keeps its own start price");
});

test("confirmations: new addresses only, and the route claims a slot only when it is about to send", () => {
  const sub = code("src/app/api/alerts/subscribe/route.ts");
  // The slot is claimed LAST in the condition, so a returning address (no
  // confirmation) or a no-op re-watch never spends one.
  assert.match(sub, /if \(result\.count > 0 && !existing && \(await claimConfirmationSlot\(prisma\)\)\)/);
  // Not the old proxy: anonymous rows created in 24h counted heart clicks by
  // returning watchers and missed signed-in confirmations.
  assert.doesNotMatch(sub, /createdAt: \{ gte: since \}/);
  assert.doesNotMatch(sub, /CONFIRMATION_DAILY_CAP/, "route files export only handlers; the cap lives in the lib");
  // The confirmation no longer promises an email on every drop.
  const email = read("src/lib/email.ts");
  const conf = email.slice(email.indexOf("export async function sendAlertConfirmationEmail"), email.indexOf("// ─── Weekly newsletter digest"));
  assert.doesNotMatch(conf, /whenever the price drops/);
  assert.match(conf, /At most one email a week/);
});

// A Counter table in memory, with the same upsert-increment semantics.
function counterStub(opts: { fail?: boolean } = {}) {
  const rows = new Map<string, number>();
  const calls: Record<string, unknown>[] = [];
  const db = {
    counter: {
      upsert: async (args: { where: { key: string }; create: { value: number }; update: { value: { increment: number } } }) => {
        calls.push(args as unknown as Record<string, unknown>);
        if (opts.fail) throw new Error("db down");
        const cur = rows.get(args.where.key);
        const value = cur == null ? args.create.value : cur + args.update.value.increment;
        rows.set(args.where.key, value);
        return { value };
      },
    },
  };
  return { db: db as unknown as ConfirmationDb, rows, calls };
}

test("the daily cap counts confirmations sent — one slot per call, per UTC day — and fails closed", async () => {
  const day = new Date("2026-09-25T10:00:00Z");
  const c = counterStub();
  const results: boolean[] = [];
  for (let i = 0; i < CONFIRMATION_DAILY_CAP + 2; i++) results.push(await claimConfirmationSlot(c.db, day));
  assert.equal(CONFIRMATION_DAILY_CAP, 30);
  assert.equal(results.filter(Boolean).length, CONFIRMATION_DAILY_CAP, "exactly the cap is sent");
  assert.deepEqual(results.slice(-2), [false, false]);
  assert.equal(c.rows.get(confirmationKey(day)), CONFIRMATION_DAILY_CAP + 2);
  assert.equal(confirmationKey(day), "alert-confirm:2026-09-25");
  // The next UTC day starts again.
  assert.equal(await claimConfirmationSlot(c.db, new Date("2026-09-26T00:00:01Z")), true);
  // One atomic upsert-increment on the key, never a read-then-write.
  assert.deepEqual(c.calls[0], {
    where: { key: "alert-confirm:2026-09-25" },
    create: { key: "alert-confirm:2026-09-25", value: 1 },
    update: { value: { increment: 1 } },
    select: { value: true },
  });
  // A failing count sends nothing.
  assert.equal(await claimConfirmationSlot(counterStub({ fail: true }).db, day), false);
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

test("alert runs follow a SUCCESSFUL, non-push import: free once a day after 07:00, paid after both", () => {
  const wf = read(".github/workflows/refresh-prices.yml");
  // The import step is addressable, and both alert steps gate on it (2026-09-25):
  // a failed import leaves RetailerPrice half-rewritten, and a push re-import
  // follows a matcher change whose "drops" are matching fixes.
  assert.match(wf, /- name: Import prices\n(\s*#[^\n]*\n)*\s*id: import\n/);
  const revalidate = wf.indexOf("- name: Revalidate site pages");
  const freeRun = wf.indexOf("- name: Free price alerts");
  const paid = wf.indexOf("- name: Paid price alerts");
  assert.ok(revalidate > 0 && freeRun > revalidate && paid > freeRun, "revalidate, then the free run, then the paid run");
  const freeStep = wf.slice(freeRun, paid);
  assert.match(freeStep, /if: steps\.import\.outcome == 'success' && github\.event_name != 'push' && github\.event\.schedule == '0 7 \* \* \*'/);
  assert.match(freeStep, /curl -s --max-time 120 "\$SITE_URL\/api\/cron\/price-alerts" -H "Authorization: Bearer \$CRON_SECRET" \|\| true/);
  const step = wf.slice(paid);
  assert.match(step, /if: steps\.import\.outcome == 'success' && github\.event_name != 'push'\n/);
  assert.doesNotMatch(wf.slice(freeRun), /if: always\(\)/, "no alert run after a failed import");
  assert.match(step, /CRON_SECRET: \$\{\{ secrets\.CRON_SECRET \}\}/);
  // Its own path: the workflow is live as soon as it lands on main, the route
  // only after the next deploy, and the old parent route ignored ?scope=paid
  // (a full "all" run after every import). A new path 404s until then.
  assert.match(step, /curl -s --max-time 120 "\$SITE_URL\/api\/cron\/price-alerts\/paid" -H "Authorization: Bearer \$CRON_SECRET" \|\| true/);
  for (const curl of step.match(/curl [^\n]*/g) ?? []) assert.doesNotMatch(curl, /scope=paid/);
  const paidRoute = read("src/app/api/cron/price-alerts/paid/route.ts");
  assert.match(paidRoute, /export async function GET\(req: Request\)/);
  assert.match(paidRoute, /auth !== `Bearer \$\{secret\}`/);
  assert.match(paidRoute, /runPriceAlerts\(\{\}, \{ scope: "paid" \}\)/);
  assert.doesNotMatch(paidRoute, /searchParams/, "this path can only ever run 'paid'");
  // The parent route is GET, authenticates that header, and still maps the query (manual runs).
  const route = read("src/app/api/cron/price-alerts/route.ts");
  assert.match(route, /export async function GET\(req: Request\)/);
  assert.match(route, /auth !== `Bearer \$\{secret\}`/);
  assert.match(route, /searchParams\.get\("scope"\) === "paid" \? "paid" : "all"/);
  assert.match(route, /runPriceAlerts\(\{\}, \{ scope \}\)/);
  // vercel.json no longer runs alerts: its 18:30 UTC run read a price 11.5h
  // old, 30 minutes before the next import. The workflow owns both runs.
  const crons = JSON.parse(read("vercel.json")).crons as { path: string }[];
  assert.deepEqual(crons.filter((c) => c.path.startsWith("/api/cron/price-alerts")), []);
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

test("Plus copy on /watching and the watchlist: ad-free, the real limit, the below-market trigger, the real cadence", () => {
  const page = code("src/app/watching/page.tsx");
  assert.match(page, /With Plus \(ad-free\), set your own price on up to \{PLUS_TARGET_ALERT_LIMIT\} cards/);
  assert.doesNotMatch(page, /on any card and hear/, "Plus is capped, not 'any card'");
  assert.match(page, /onPlus \? `up to \$\{PLUS_TARGET_ALERT_LIMIT\} cards` : "any card"/);
  assert.match(page, /below TCGplayer market/);
  const wl = code("src/components/Watchlist.tsx");
  assert.doesNotMatch(wl, /the moment it gets cheaper/);
  assert.match(wl, /when it hits a new low, naming the cheapest store — at most one email a week/);
  const alerts = code("src/app/alerts/page.tsx");
  assert.match(alerts, /Plus has two exceptions/);
  assert.match(alerts, /below TCGplayer market at a new low/);
  assert.match(alerts, /carries any other new lows/);
  assert.doesNotMatch(alerts, /own price on any watched card/);
  const field = code("src/components/TargetPriceField.tsx");
  assert.match(field, /new-low and below-market alerts/);
});

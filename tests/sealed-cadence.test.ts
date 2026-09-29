import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SEALED_RESTOCK_COOLDOWN_MS, SEALED_RESTOCK_MIN_SOLDOUT_MS, SEALED_WATCH_COOLDOWN_MS, inSealedCooldown, sealedCooldownMs } from "../src/lib/sealed-watch";
import { SEALED_CHECK_CADENCE, SEALED_CHECK_SENTENCE, SEALED_RRP_MARKETS, SEALED_RRP_ONLY } from "../src/lib/alert-limits";
import { msrpCents } from "../src/lib/msrp";
import { freshSealedLoaders, groupSealedRowsForWatch, type SealedAlertRow } from "../src/lib/sealed-alert-read";
import { buildSealedWatchEmail, type SealedWatchKind } from "../src/lib/watch-emails";
import { checkedLabel } from "../src/lib/email";
import { TIER_COMPARISON } from "../src/components/TierComparisonTable";
import { NOW, group, hoursAgo, offer, plus, premium, lapsed, sealedHarness, sealedRow } from "./helpers/watch-harness";

// ─────────────────────────────────────────────────────────────────────────────
// SEALED WATCHES CHECKED ABOUT EVERY SIX HOURS (2026-09-29, DECISIONS.md
// "Sealed watches are checked about every six hours"): the restock rule
// retuned for a six-hour check, its own cooldown, the schedule-only workflow,
// the sealed-only alert route with an uncached read, and the checked time and
// cadence in every email. tests/watches-cron.test.ts pins the twice-daily
// paid route these sit beside; tests/nested-cache.test.ts the cache rules.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/.*$/gm, "$1");
// A workflow with its YAML comments removed (a header may QUOTE the step it forbids).
const yamlCode = (p: string) => read(p).split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");

// ── The restock rule ─────────────────────────────────────────────────────────

test("the thresholds: a five-hour sold-out floor and a six-hour restock cooldown; 24h stays for the rest", () => {
  assert.equal(SEALED_RESTOCK_MIN_SOLDOUT_MS, 5 * 3_600_000);
  assert.equal(SEALED_RESTOCK_COOLDOWN_MS, 6 * 3_600_000);
  assert.equal(SEALED_WATCH_COOLDOWN_MS, 24 * 3_600_000);
  // A run that starts a few minutes early still sees a six-hourly sell-out as a sell-out.
  assert.ok(SEALED_RESTOCK_MIN_SOLDOUT_MS < 6 * 3_600_000 - 5 * 60_000, "room for the scheduler's drift below one interval");
  assert.equal(sealedCooldownMs("sealed_restock"), SEALED_RESTOCK_COOLDOWN_MS);
  for (const k of ["sealed_target", "sealed_rrp", "sealed_drop"] as const) assert.equal(sealedCooldownMs(k), SEALED_WATCH_COOLDOWN_MS, k);
  assert.equal(sealedCooldownMs(), SEALED_WATCH_COOLDOWN_MS, "no kind: the long one, as before");
  assert.equal(inSealedCooldown(hoursAgo(7), NOW, "sealed_restock"), false);
  assert.equal(inSealedCooldown(hoursAgo(5), NOW, "sealed_restock"), true);
  assert.equal(inSealedCooldown(hoursAgo(7), NOW, "sealed_drop"), true);
  assert.equal(inSealedCooldown(hoursAgo(7), NOW), true);
  assert.equal(inSealedCooldown(null, NOW, "sealed_restock"), false);
});

test("a restock after a 7h sell-out fires (it was cleared as a short gap under the old 20h rule)", async () => {
  const h = sealedHarness([sealedRow("s1", plus, { lastPriceCents: 15000, lastInStock: false, soldOutAt: hoursAgo(7) })], { groups: [group([offer(15000)])] });
  const s = await h.run();
  assert.equal(s.restocks, 1);
  assert.equal(s.emails, 1);
  assert.equal(h.sent[0]!.item.kind, "sealed_restock");
  assert.deepEqual(h.sent[0]!.item.soldOutAt, hoursAgo(7));
  assert.equal(h.writeFor("s1")!.soldOutAt, null);
});

test("the gap between two runs about six hours apart is enough, even with the scheduler a few minutes early; a short blip is not", async () => {
  for (const [minutes, fires] of [[5 * 60 + 50, true], [6 * 60 + 40, true], [5 * 60, true], [4 * 60 + 59, false], [3 * 60, false]] as const) {
    const h = sealedHarness([sealedRow("s1", plus, { lastPriceCents: 15000, lastInStock: false, soldOutAt: new Date(NOW.getTime() - minutes * 60_000) })], { groups: [group([offer(15000)])] });
    const s = await h.run();
    assert.equal(s.restocks, fires ? 1 : 0, `${minutes} minutes sold out`);
    if (!fires) assert.equal(h.writeFor("s1")!.soldOutAt, null, "a blip clears quietly");
  }
});

test("a sell-out is started by one run and told by a later one, six hours on (the whole cycle)", async () => {
  // 07:00: sold out everywhere → the clock starts.
  const first = sealedHarness([sealedRow("s1", plus, { lastPriceCents: 15000, lastInStock: true })], { groups: [group([offer(15000, { inStock: false })])] });
  await first.run();
  const started = first.writeFor("s1")!.soldOutAt as Date;
  assert.deepEqual(started, NOW);
  // 13:00 (six hours later, five minutes early): a store has it → told.
  const later = new Date(NOW.getTime() + 6 * 3_600_000 - 5 * 60_000);
  const second = sealedHarness([sealedRow("s1", plus, { lastPriceCents: 15000, lastInStock: false, soldOutAt: started })], {
    now: later,
    groups: [group([offer(15000, { lastSeen: new Date(later.getTime() - 60_000).toISOString() })])],
  });
  const s = await second.run();
  assert.equal(s.restocks, 1, "the very next run tells it");
  assert.equal(second.sent.length, 1);
});

test("the restock cooldown: an email in the last 6h holds a restock (baseline kept, re-detected next run); 7h does not; a drop still waits 24h", async () => {
  const base = { lastPriceCents: 15000, lastInStock: false, soldOutAt: hoursAgo(8), lastEmailedCents: 15000 };
  const held = sealedHarness([sealedRow("s1", plus, { ...base, lastNotifiedAt: hoursAgo(3) })], { groups: [group([offer(15000)])] });
  const s1 = await held.run();
  assert.equal(s1.restocks, 1);
  assert.equal(s1.cooldown, 1);
  assert.equal(held.sent.length, 0);
  assert.equal(held.writeFor("s1")?.soldOutAt, undefined, "held: the sold-out clock is kept, so the restock is found again");
  const free = sealedHarness([sealedRow("s1", plus, { ...base, lastNotifiedAt: hoursAgo(7) })], { groups: [group([offer(15000)])] });
  const s2 = await free.run();
  assert.equal(s2.cooldown, 0);
  assert.equal(free.sent.length, 1, "past the restock cooldown, well inside the 24h one");
  assert.equal(free.sent[0]!.item.kind, "sealed_restock");
  // The 24h one still governs a drop emailed 12h ago.
  const drop = sealedHarness([sealedRow("s1", premium, { lastPriceCents: 20000, lastEmailedCents: 20000, lastNotifiedAt: hoursAgo(12) })], { groups: [group([offer(17000)])] });
  const s3 = await drop.run();
  assert.equal(s3.drops, 1);
  assert.equal(s3.cooldown, 1);
  assert.equal(drop.sent.length, 0);
});

test("the sealed pass skips lapsed owners untouched and never evaluates an eBay listing", async () => {
  const h = sealedHarness(
    [sealedRow("gone", lapsed, { lastPriceCents: 15000, lastInStock: false, soldOutAt: hoursAgo(9) }), sealedRow("ok", plus, { lastPriceCents: 15000, lastInStock: false, soldOutAt: hoursAgo(9) })],
    { groups: [group([offer(15000)])] },
  );
  const s = await h.run();
  assert.equal(s.lapsed, 1);
  assert.equal(h.writeFor("gone"), undefined, "a lapsed owner's row is not touched");
  assert.equal(h.sent.length, 1);
  const ebay = sealedHarness([sealedRow("s1", plus, { lastPriceCents: 15000, lastInStock: false, soldOutAt: hoursAgo(9) })], {
    groups: [group([offer(15000, { inStock: false }), offer(9000, { retailer: "ebay_us", retailerName: "eBay" })])],
  });
  await ebay.run();
  assert.equal(ebay.sent.length, 0, "eBay never counts as a restock");
});

// ── The uncached read ────────────────────────────────────────────────────────

const row = (over: Partial<SealedAlertRow> = {}): SealedAlertRow => ({
  groupKey: "OGN|Booster Box",
  title: "Riftbound Origins Booster Box",
  productType: "Booster Box",
  setCode: "OGN",
  retailer: "shopx",
  retailerName: "Shop X",
  priceCents: 15000,
  url: "https://shopx.example/box",
  inStock: true,
  lastSeen: new Date(NOW.getTime() - 3_600_000),
  ...over,
});

test("the fresh read groups the way /sealed does for a watch: real stores only, one listing per store, the tile's name", () => {
  const groups = groupSealedRowsForWatch(
    [
      row(),
      row({ retailer: "ebay_us", retailerName: "eBay", priceCents: 9000 }),
      row({ retailer: "tcgplayer", retailerName: "TCGplayer", priceCents: 14000 }),
      row({ retailer: "shopy", retailerName: "Shop Y", priceCents: 15500, inStock: false }),
      row({ retailer: "shopy", retailerName: "Shop Y", priceCents: 16000, inStock: true }),
      row({ priceCents: 1 }), // below the per-type floor: a mis-priced accessory
      row({ groupKey: "OGN|Vault", productType: "Vault", retailer: "shopz", retailerName: "Shop Z", priceCents: 30000 }), // legacy type → Bundle
    ],
    "US",
    NOW,
  );
  const box = groups.find((g) => g.groupKey === "OGN|Booster Box")!;
  assert.equal(box.name, "Origins Booster Box");
  assert.deepEqual(box.listings.map((l) => l.retailer).sort(), ["shopx", "shopy"], "no eBay row and no TCGplayer reference row");
  assert.equal(box.listings.find((l) => l.retailer === "shopy")!.inStock, true, "the best listing per store (open before sold out)");
  assert.equal(typeof box.listings[0]!.lastSeen, "string", "lastSeen is the ISO string the run parses for its 'checked' time");
  assert.ok(groups.some((g) => g.groupKey === "OGN|Bundle"), "a legacy product type is merged into its canonical group");
  assert.equal(groups.some((g) => g.groupKey === "OGN|Vault"), false);
});

test("one read per market for a pass, shared by the shipped and the pre-order side; a failed read is not remembered", async () => {
  const reads: string[] = [];
  const all = async (market: string) => {
    reads.push(market);
    return [group([offer(15000)]), group([offer(17000)], { groupKey: "RAD|Booster Box", name: "Radiance Booster Box", setCode: "RAD" })];
  };
  const BEFORE_RADIANCE = new Date("2026-10-01T00:00:00Z"); // NOW is after the 23 Oct release
  const loaders = freshSealedLoaders(BEFORE_RADIANCE, all as never);
  const shipped = await loaders.groups("US");
  const pre = await loaders.preorderGroups("US");
  await loaders.groups("US");
  await loaders.groups("AU");
  assert.deepEqual(reads, ["US", "AU"], "each market is read once");
  assert.deepEqual(shipped.map((g) => g.groupKey), ["OGN|Booster Box"]);
  assert.deepEqual(pre.map((g) => g.groupKey), ["RAD|Booster Box"], "Radiance is a pre-order before its release date");
  let n = 0;
  const flaky = freshSealedLoaders(NOW, (async () => {
    if (n++ === 0) throw new Error("db down");
    return [];
  }) as never);
  await assert.rejects(flaky.groups("US"));
  assert.deepEqual(await flaky.groups("US"), [], "the next call reads again");
});

test("the fresh read is uncached by construction and reads narrowly", () => {
  const src = code("src/lib/sealed-alert-read.ts");
  assert.doesNotMatch(src, /unstable_cache|cachedOrDirect|revalidateTag|revalidatePath|CONTENT_TAG/, "no cache and no bust");
  assert.doesNotMatch(src, /\bgetSealedGroups\(|\bgetPreorderGroups\(|computeAllSealedGroups|getAllSealedGroups\(/, "neither a self-cached loader nor the importer's private compute");
  assert.match(src, /take: SEALED_ALERT_READ_CAP/, "egress rule 3: a cap");
  assert.match(src, /select: \{ groupKey: true, title: true, productType: true, setCode: true, retailer: true, retailerName: true, priceCents: true, url: true, inStock: true, lastSeen: true \}/, "a narrow select");
  assert.match(src, /where: \{ country: market, NOT: \[/, "one market, and no eBay or TCGplayer row leaves the database");
  // sealed-import.ts is not edited for this: a push touching it starts a full price import.
  assert.doesNotMatch(read("src/lib/sealed-import.ts"), /getSealedGroupsFresh|sealed-alert-read/);
});

// ── The route ────────────────────────────────────────────────────────────────

test("GET /api/cron/price-alerts/sealed runs ONLY the sealed pass, behind the same bearer secret, with no cache bust", () => {
  const src = read("src/app/api/cron/price-alerts/sealed/route.ts");
  const route = code("src/app/api/cron/price-alerts/sealed/route.ts");
  assert.match(route, /export async function GET\(req: Request\)/);
  assert.match(route, /auth !== `Bearer \$\{secret\}`/, "the same auth as the paid route");
  assert.match(route, /status: 401/);
  assert.match(route, /await runSealedWatches\(\{ sendCap: PAID_SEND_CAP, groups: loaders\.groups, preorderGroups: loaders\.preorderGroups \}\)/, "the shared cap, the uncached loaders");
  assert.match(route, /const loaders = freshSealedLoaders\(\)/);
  for (const other of ["runPriceAlerts", "runDeckWatches", "runReleaseAlerts", "bustSealedGroups", "getSealedGroups", "getPreorderGroups", "revalidateTag", "revalidatePath", "unstable_cache", "freshen"]) {
    assert.ok(!route.includes(other), `the sealed route must not touch ${other}`);
  }
  assert.equal((route.match(/\brun[A-Z]\w+\(/g) ?? []).length, 1, "exactly one pass is run");
  assert.match(src, /export const dynamic = "force-dynamic"/);
  // The budget is the shared one: the run's own default, never a bigger number.
  const run = code("src/lib/sealed-watch.ts");
  assert.match(run, /deps\.dailyBudget \?\? alertDailyBudget\(\)/);
  assert.match(run, /deps\.sendCap \?\? PAID_SEND_CAP/);
  // The paid route is unchanged in shape: still three passes, still ?fresh=1.
  assert.match(code("src/app/api/cron/price-alerts/paid/route.ts"), /freshen: fresh \? bustSealedGroups : undefined/);
});

// ── The workflow ─────────────────────────────────────────────────────────────

test("sealed-refresh.yml: schedule-only at 01:00 and 13:00 UTC, the stores-only importer, no eBay, no revalidate or tag bust", () => {
  const wf = yamlCode(".github/workflows/sealed-refresh.yml");
  assert.match(wf, /^on:\n  schedule:\n    - cron: "0 1 \* \* \*"\n    - cron: "0 13 \* \* \*"\n  workflow_dispatch: \{\}/m);
  for (const trigger of ["push:", "pull_request", "pull_request_target", "workflow_run", "repository_dispatch", "branches:", "paths:"]) {
    assert.ok(!wf.includes(trigger), `no ${trigger} trigger`);
  }
  // The bust: neither the step, nor its endpoint, nor the tag, nor the ?fresh=1 form of the paid route.
  assert.doesNotMatch(wf, /revalidate/i, "no 'Revalidate site pages' step and no /api/revalidate call");
  assert.doesNotMatch(wf, /CONTENT_TAG|fresh=1/);
  // The existing importer, the stores-only one; not the twice-daily job's (eBay, Cardmarket, weekly history write).
  assert.match(wf, /npx tsx scripts\/import-sealed-only\.ts/);
  assert.doesNotMatch(wf, /scripts\/import-sealed\.ts|scripts\/import-prices\.ts|refresh-ebay|import-ebay/);
  assert.match(wf, /EBAY_REFRESH: "false"/);
  assert.doesNotMatch(wf, /EBAY_CLIENT|EBAY_FORCE|EBAY_AFFILIATE/, "no eBay credential is even exposed to the step");
  assert.doesNotMatch(wf, /HISTORY_DATABASE_URL|RH\d+:/, "no history project: the weekly SealedPriceHistory write is not run here");
  // Then only the sealed alert pass, after a successful import.
  assert.match(wf, /\/api\/cron\/price-alerts\/sealed"/);
  assert.doesNotMatch(wf, /price-alerts\/paid|price-alerts"|price-alerts\/baseline|release-alerts/);
  assert.match(wf, /steps\.import\.outcome == 'success'/);
  assert.match(wf, /Authorization: Bearer \$CRON_SECRET/);
  // One importer at a time on SealedListing.
  assert.match(wf, /concurrency:\n  group: refresh-prices\n  cancel-in-progress: false/);
  // The script is the existing one, and it does not write history.
  const script = code("scripts/import-sealed-only.ts");
  assert.match(script, /importSealed\(\)/);
  assert.doesNotMatch(script, /writeSealedPriceHistory|refreshCardmarketSealed/);
});

test("the twice-daily workflow is untouched by this: still 07:00 and 19:00, still the one that revalidates", () => {
  const wf = read(".github/workflows/refresh-prices.yml");
  assert.match(wf, /- cron: "0 7 \* \* \*"\n    - cron: "0 19 \* \* \*"/);
  assert.match(wf, /- name: Revalidate site pages \(on-demand ISR\)/);
  // The two new runs sit between the two old ones: 01, 07, 13, 19 — six hours apart.
  const hours = [1, 7, 13, 19];
  for (let i = 1; i < hours.length; i++) assert.equal(hours[i]! - hours[i - 1]!, 6);
  assert.equal(24 - hours[3]! + hours[0]!, 6, "and the wrap from 19:00 to 01:00");
});

// ── The email and the copy ───────────────────────────────────────────────────

test("every sealed email states when the store was last read, in the body and the text, and the cadence honestly", async () => {
  const h = sealedHarness([sealedRow("s1", plus, { lastPriceCents: 15000, lastInStock: false, soldOutAt: hoursAgo(9) })], { groups: [group([offer(15000)])] });
  await h.run();
  const item = h.sent[0]!.item;
  const when = checkedLabel(item.checkedAt, item.market);
  assert.deepEqual(item.checkedAt, hoursAgo(2), "the listing's own lastSeen, not the run's clock");
  for (const kind of ["sealed_restock", "sealed_rrp", "sealed_target", "sealed_drop"] as SealedWatchKind[]) {
    const e = buildSealedWatchEmail({ ...item, kind, targetCents: kind === "sealed_target" ? 15500 : null });
    assert.match(e.html, new RegExp(`<strong[^>]*>Checked ${when.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} at Shop X\\.</strong>`), `${kind}: a bold checked time in the body`);
    assert.ok(e.text.includes(`Checked ${when} at Shop X.`), `${kind}: and in the text part`);
    assert.ok(e.preheader.includes(`checked ${when}`), `${kind}: and in the preheader`);
    assert.ok(e.html.includes(SEALED_CHECK_SENTENCE.replace(/'/g, "&#39;")) || e.html.includes(SEALED_CHECK_SENTENCE), `${kind}: the cadence`);
    assert.ok(e.text.includes(SEALED_CHECK_SENTENCE), `${kind}: the cadence in the text`);
    assert.match(e.html, /sealed products are checked about every six hours/, `${kind}: the footer no longer says "after every price update"`);
    assert.doesNotMatch(e.html + e.text, /instant|first in line|beat the bots|after every price update/i, kind);
  }
  assert.ok(SEALED_CHECK_SENTENCE.includes("A Discord stock bot may be faster."));
});

test("the copy says 'about every six hours' everywhere the cadence is named, and never promises speed", () => {
  const row = TIER_COMPARISON.find((r) => r.feature.startsWith("Sealed watches"))!;
  assert.equal(row.feature, `Sealed watches — restock, at-RRP (${SEALED_RRP_MARKETS}) and price alerts, checked ${SEALED_CHECK_CADENCE}`);
  assert.equal(SEALED_CHECK_CADENCE, "about every six hours");
  for (const f of ["src/app/premium/page.tsx", "src/components/SealedWatchButton.tsx", "src/app/watching/page.tsx", "src/app/llms.txt/route.ts", "src/lib/articles.ts", "src/components/TierComparisonTable.tsx"]) {
    assert.match(read(f), /SEALED_CHECK_CADENCE/, `${f} quotes the cadence from the constant`);
  }
  for (const f of ["src/app/premium/page.tsx", "src/components/SealedWatchButton.tsx", "src/app/watching/page.tsx", "src/lib/watch-emails.ts", "src/lib/alert-limits.ts", "src/components/PremiumSlideIn.tsx"]) {
    const src = code(f);
    assert.doesNotMatch(src, /first in line|beat the bots|instant sealed|instant restock|instantly (email|tell)/i, `${f} promises no speed`);
  }
  // The old promises are gone from the sealed watch copy.
  for (const f of ["src/app/premium/page.tsx", "src/lib/articles.ts"]) {
    assert.doesNotMatch(read(f), /sold out at every store (we track|it tracks) for at least a day|checked after every price update, at most (once a day|one email a day) per product/, `${f} still quotes the old restock rule`);
  }
});

// ── Review fixes (2026-09-29) ────────────────────────────────────────────────

test("the sealed alert route fails CLOSED: no CRON_SECRET, or the wrong one, is a 401 before anything is read or sent", async () => {
  const { GET } = await import("../src/app/api/cron/price-alerts/sealed/route");
  const saved = process.env.CRON_SECRET;
  try {
    delete process.env.CRON_SECRET;
    const url = "http://localhost/api/cron/price-alerts/sealed";
    assert.equal((await GET(new Request(url))).status, 401, "no secret configured: nobody is authorised");
    assert.equal((await GET(new Request(url, { headers: { authorization: "Bearer undefined" } }))).status, 401);
    process.env.CRON_SECRET = "s3cret";
    assert.equal((await GET(new Request(url))).status, 401, "no header");
    assert.equal((await GET(new Request(url, { headers: { authorization: "Bearer nope" } }))).status, 401, "wrong header");
  } finally {
    if (saved === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = saved;
  }
});

test("'at RRP' is qualified wherever it is promised: it exists only where lib/msrp.ts publishes an RRP", () => {
  // The markets in the copy are the markets the RRP table has.
  const withRrp = (["AU", "US", "UK", "CA", "SG", "EU"] as const).filter((m) => msrpCents("Booster Box", m) != null);
  assert.deepEqual(withRrp, ["AU", "US", "UK"]);
  assert.equal(SEALED_RRP_MARKETS, "AU/US/UK");
  assert.equal(SEALED_RRP_ONLY, "AU/US/UK only");
  const row = TIER_COMPARISON.find((r) => r.feature.startsWith("Sealed watches"))!;
  assert.match(row.feature, /at-RRP \(AU\/US\/UK\)/);
  for (const f of ["src/components/SealedWatchButton.tsx", "src/app/watching/page.tsx"]) {
    assert.match(read(f), /SEALED_RRP_ONLY/, `${f} says where at-RRP exists`);
  }
  // /premium's note under "What you get" names the RRP markets from the constant
  // (the pricing cards no longer list sealed alerts' RRP wording).
  assert.match(read("src/app/premium/page.tsx"), /RRP is the price Riot sets, shown for \{SEALED_RRP_MARKETS\}/);
});

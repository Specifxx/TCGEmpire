import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deflateRawSync } from "node:zlib";
import {
  AMAZON_TRACKING_SITES,
  amazonCents,
  amazonReportDay,
  amazonTag,
  amazonTagDays,
  parseAmazonEarnings,
  unzipFirst,
} from "../src/lib/earnings/amazon";
import { tagBreakdown, tagGroup, type SourceResult } from "../src/lib/earnings/core";
import { siteLedger } from "../src/lib/earnings/sites";

// The shape Associates Central's Fee-Earnings download has: a title line, then the header.
const REPORT = [
  "Fee-Earnings reports from 10-01-2026 to 10-31-2026",
  "Category,Name,ASIN,Seller,Tracking ID,Date Shipped,Price($),Items Shipped,Returns,Revenue($),Ad Fees($),Device Type Group,Direct",
  'Toys,"Riftbound Origins Booster Box, 24 packs",B0TEST0001,Amazon.com.au,riftcompare-22,2026-10-14 05:23:14,180.00,1,0,180.00,5.40,DESKTOP,N',
  "Toys,One Piece OP-12 Booster,B0TEST0002,Amazon.com.au,opcompare-22,2026-10-14 09:00:00,9.00,2,0,18.00,0.54,PHONE,N",
  "Toys,Riftbound sleeves,B0TEST0003,Amazon.com.au,riftcompare-22,2026-10-14 11:00:00,12.00,1,0,12.00,0.36,PHONE,N",
  "Beauty,Sunscreen,B0TEST0004,Amazon.com.au,compareempire-22,2026-10-20 11:00:00,20.00,1,1,0.00,-0.60,PHONE,N",
  ",,,,,Total,,5,1,210.00,5.70,,",
].join("\r\n");

test("an Earnings report becomes one row per day and tracking ID; the title gives the range it replaces", () => {
  const u = parseAmazonEarnings(REPORT, true);
  assert.equal(u.from, "2026-10-01");
  assert.equal(u.to, "2026-10-31", "10-31 is unambiguous, so day-first can't misread the range");
  assert.deepEqual(u.rows, [
    { day: "2026-10-14", trackingId: "opcompare-22", cents: 54, items: 2 },
    { day: "2026-10-14", trackingId: "riftcompare-22", cents: 576, items: 2 },
    { day: "2026-10-20", trackingId: "compareempire-22", cents: -60, items: 0 },
  ]);
  assert.equal(u.items, 4, "the totals row is not a sale");
});

test("a range that could be read both ways never widens past the rows (an upload deletes its range)", () => {
  const amb = REPORT.replace("from 10-01-2026 to 10-31-2026", "from 10-01-2026 to 11-02-2026");
  const u = parseAmazonEarnings(amb, true);
  assert.deepEqual([u.from, u.to], ["2026-10-01", "2026-11-02"], "Jan 10 to Feb 11 would not hold the October rows");
  const noTitle = REPORT.split("\r\n").slice(1).join("\n");
  const v = parseAmazonEarnings(noTitle);
  assert.deepEqual([v.from, v.to], ["2026-10-14", "2026-10-20"]);
});

test("a summary report, or a file that isn't a report, is refused with a reason", () => {
  assert.throws(() => parseAmazonEarnings("Date,Clicks,Ordered Items\n2026-10-01,4,0"), /Tracking ID/);
  assert.throws(() => parseAmazonEarnings("Tracking ID,Clicks\nriftcompare-22,4"), /ship date or ad fee/);
});

test("dates and amounts in each store's own format", () => {
  assert.equal(amazonReportDay("October 14, 2026"), "2026-10-14");
  assert.equal(amazonReportDay("14 Oct 2026"), "2026-10-14");
  assert.equal(amazonReportDay("10/14/2026", true), "2026-10-14", "unambiguous beats the store's habit");
  assert.equal(amazonReportDay("03/10/2026", true), "2026-10-03");
  assert.equal(amazonReportDay("03/10/2026", false), "2026-03-10");
  assert.equal(amazonReportDay("2026-02-30"), null);
  assert.equal(amazonCents("$1,234.56"), 123456);
  assert.equal(amazonCents("12,34"), 1234, "amazon.de's decimal comma");
  assert.equal(amazonCents("-0.60"), -60);
  // Tab-separated, day-first dates decided by the file itself.
  const tsv = "Tracking ID\tDate Shipped\tItems Shipped\tAd Fees\nkaeyoung-22\t03/10/2026\t1\t1.10\nkaeyoung-22\t25/10/2026\t1\t2.00\n";
  assert.deepEqual(parseAmazonEarnings(tsv, false).rows.map((r) => r.day), ["2026-10-03", "2026-10-25"]);
});

test("Amazon's ZIP is read (stored and deflated, sizes from the central directory)", () => {
  const data = Buffer.from(REPORT);
  for (const method of [0, 8]) {
    const body = method ? deflateRawSync(data) : data;
    const name = Buffer.from("Fee-Earnings.csv");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 6); // sizes in a data descriptor: the local header says 0
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(0, 42);
    const cdStart = local.length + name.length + body.length;
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(1, 8);
    eocd.writeUInt16LE(1, 10);
    eocd.writeUInt32LE(central.length + name.length, 12);
    eocd.writeUInt32LE(cdStart, 16);
    const zip = Buffer.concat([local, name, body, central, name, eocd]);
    assert.equal(unzipFirst(zip)?.toString("utf8"), REPORT);
  }
  assert.equal(unzipFirst(data), null, "a plain CSV passes through");
});

test("tracking IDs split by site; shared IDs never land on one site", () => {
  assert.equal(amazonTag("riftcompare-22", "au"), "rc-au-riftcompare-22");
  assert.equal(amazonTag("riftcompare-20", "us"), "amazon-us-riftcompare-20", "the US ID serves several sites");
  assert.equal(amazonTag("compareempire-22", "au"), "amazon-au-compareempire-22");
  assert.equal(amazonTag("somethingnew-22", "au"), "amazon-au-somethingnew-22");
  for (const [id, site] of Object.entries(AMAZON_TRACKING_SITES)) assert.equal(tagGroup(amazonTag(id, "au")).key, site, id);
  assert.equal(tagGroup("amazon-us-riftcompare-20").label, "Amazon, shared ID (several sites)");

  const rows = [
    { day: "2026-10-14", currency: "AUD", amountCents: 576, tag: "rc-au-riftcompare-22", units: 2 },
    { day: "2026-10-14", currency: "AUD", amountCents: 54, tag: "oc-au-opcompare-22", units: 2 },
    { day: "2026-10-31", currency: "AUD", amountCents: 0, tag: "", units: 0 }, // the coverage marker
  ];
  const tags = amazonTagDays(rows);
  assert.equal(tags.length, 2, "the marker is not a tag");
  const groups = tagBreakdown(tags, "all", "2026-11-03", "AUD");
  assert.deepEqual(groups.map((g) => [g.key, g.cents, g.sales]), [["rc", 576, 2], ["oc", 54, 2]]);

  const amazon: SourceResult = { key: "amazon", status: "ok", fetchedAt: 0, days: [{ day: "2026-10-14", currency: "AUD", cents: 630 }], tags };
  const ledger = siteLedger([amazon], [], [], "2026-10-01", "2026-10-31", "AUD");
  assert.equal(ledger.find((r) => r.key === "rc")?.earned, 576);
  assert.equal(ledger.find((r) => r.key === "oc")?.earned, 54);
});

test("the upload route is admin-only, replaces its store's range, and the table stays private", () => {
  const route = readFileSync(new URL("../src/app/api/admin/earnings/amazon/route.ts", import.meta.url), "utf8");
  assert.match(route, /if \(!form \|\| !\(await allowed\(form\.get\("key"\)\)\)\) return NextResponse\.json\(\{ error: "Not allowed" \}, \{ status: 403 \}\);/);
  assert.match(route, /if \(!\(await allowed\(body\?\.key\)\)\) return NextResponse\.json\(\{ error: "Not allowed" \}, \{ status: 403 \}\);/);
  assert.match(route, /deleteMany\(\{ where: \{ source: "amazon", currency: store\.currency, day: \{ gte: from, lte: to \} \} \}\)/);
  const page = readFileSync(new URL("../src/app/admin/earnings/page.tsx", import.meta.url), "utf8");
  assert.match(page, /where: \{ source: "mediavine" \}/, "Amazon's rows don't flood the Mediavine list");
});

test("the Chrome prompt starts each store the day after its last upload, 90 days back before the first", async () => {
  const { amazonChromePrompt, amazonNextFrom } = await import("../src/lib/earnings/amazon");
  assert.equal(amazonNextFrom({ to: "2026-10-20" }, "2026-11-03"), "2026-10-21");
  assert.equal(amazonNextFrom({ to: "2026-11-03" }, "2026-11-03"), "2026-11-03", "never a start after today");
  assert.equal(amazonNextFrom({ to: null }, "2026-11-03"), "2026-08-05");
  const p = amazonChromePrompt(
    [
      { key: "au", label: "Amazon.com.au", to: "2026-10-20" },
      { key: "us", label: "Amazon.com", to: null },
    ],
    "2026-11-03",
  );
  assert.match(p, /Amazon\.com\.au \(store code "au"\): https:\/\/affiliate-program\.amazon\.com\.au — read 2026-10-21 to 2026-11-03 \(dashboard covered through 2026-10-20\)/);
  assert.match(p, /Amazon\.com \(store code "us"\): https:\/\/affiliate-program\.amazon\.com — read 2026-08-05 to 2026-11-03 \(nothing on the dashboard yet\)/);
  assert.match(p, /never download anything/, "owner 2026-11-06: no downloads, no uploads");
  assert.doesNotMatch(p, /upload (a|the|it|them)/i, "nothing is uploaded");
  assert.match(p, /Amazon figures/);
  assert.match(p, /Save figures/);
  assert.match(p, /NEVER STOP PARTWAY/);
  assert.match(p, /SAFE TO RERUN/);
  assert.doesNotMatch(p, /week/i, "on demand, never a weekly task (owner, 2026-11-03)");
  const sources = readFileSync(new URL("../src/lib/earnings/sources.ts", import.meta.url), "utf8");
  assert.doesNotMatch(sources, /AMAZON_STALE|stale/, "no nag about the age of the last upload");
});

test("figures typed from the screen: one block per store, days and tracking IDs, errors name the line", async () => {
  const { parseAmazonEntry } = await import("../src/lib/earnings/amazon");
  const [au, us] = parseAmazonEntry(`store: au
range: 2026-10-21 to 2026-10-23
day 2026-10-21 3.40 2
- day 2026-10-22 0 0
day 23/10/2026 A$1.10 1
id riftcompare-22 2.50 2
id RiftCompare-22 3.50 2
id compareempire-22 1.00 1

Store: Amazon.com
range: 10/01/2026 - 10/02/2026
day 10/02/2026 $5 1
`);
  assert.equal(au.key, "au");
  assert.deepEqual([au.from, au.to], ["2026-10-21", "2026-10-23"]);
  assert.deepEqual(au.days, [
    { day: "2026-10-21", cents: 340, items: 2 },
    { day: "2026-10-22", cents: 0, items: 0 },
    { day: "2026-10-23", cents: 110, items: 1 },
  ]);
  assert.deepEqual(au.ids, [
    { trackingId: "riftcompare-22", cents: 350, items: 2 },
    { trackingId: "compareempire-22", cents: 100, items: 1 },
  ], "a repeated id replaces the earlier line");
  assert.equal(us.key, "us");
  assert.deepEqual([us.from, us.to], ["2026-10-01", "2026-10-02"]);
  assert.deepEqual(us.days, [{ day: "2026-10-02", cents: 500, items: 1 }]);
  assert.throws(() => parseAmazonEntry("day 2026-10-21 1 1"), /start with a "store: au" line/);
  assert.throws(() => parseAmazonEntry("store: jp\n"), /unknown store/);
  assert.throws(() => parseAmazonEntry("store: au\nday 2026-10-21 1 1"), /range/);
  assert.throws(() => parseAmazonEntry("store: au\nrange: 2026-10-21 to 2026-10-22\nday 2026-10-25 1 1"), /outside its range/);
  assert.throws(() => parseAmazonEntry("store: au\nrange: 2026-10-21 to 2026-10-22\nearnings 5"), /line 3/);
  assert.throws(() => parseAmazonEntry(""), /Nothing to save/);
});

test("tracking-ID totals are spread over the days by the days' totals; day and ID totals land exactly; the rest is shared", async () => {
  const { allocateAmazonEntry, amazonTag } = await import("../src/lib/earnings/amazon");
  const rows = allocateAmazonEntry({
    key: "au",
    from: "2026-10-21",
    to: "2026-10-23",
    days: [
      { day: "2026-10-21", cents: 300, items: 3 },
      { day: "2026-10-22", cents: 0, items: 0 },
      { day: "2026-10-23", cents: 100, items: 1 },
    ],
    ids: [
      { trackingId: "riftcompare-22", cents: 301, items: 2 },
      { trackingId: "compareempire-22", cents: 50, items: 1 },
    ],
  });
  const sum = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).reduce((n, r) => n + r.cents, 0);
  assert.equal(sum((r) => r.trackingId === "riftcompare-22"), 301, "an ID's total lands exactly, to the cent");
  assert.equal(sum((r) => r.trackingId === "compareempire-22"), 50);
  assert.equal(sum((r) => r.day === "2026-10-21"), 300, "a day's total lands exactly");
  assert.equal(sum((r) => r.day === "2026-10-22"), 0);
  assert.equal(sum((r) => r.day === "2026-10-23"), 100);
  assert.equal(sum((r) => r.trackingId === "all"), 49, "what the days hold beyond the IDs is shared");
  assert.equal(amazonTag("all", "au"), "amazon-au-all", "the shared row, never a site");
  assert.ok(!rows.some((r) => r.day === "2026-10-22"), "a zero day gets no rows");
  assert.equal(rows.filter((r) => r.trackingId === "riftcompare-22").reduce((n, r) => n + r.items, 0), 2);

  // No day lines: even spread. No id lines: the days stay on the shared row.
  const even = allocateAmazonEntry({ key: "us", from: "2026-10-01", to: "2026-10-02", days: [], ids: [{ trackingId: "riftcompare-20", cents: 101, items: 1 }] });
  assert.deepEqual(even.map((r) => r.cents), [51, 50]);
  const shared = allocateAmazonEntry({ key: "us", from: "2026-10-01", to: "2026-10-02", days: [{ day: "2026-10-02", cents: 70, items: 1 }], ids: [] });
  assert.deepEqual(shared, [{ day: "2026-10-02", trackingId: "all", cents: 70, items: 1 }]);
});

test("the typed-entry route is admin-only, replaces each store's range and marks coverage", () => {
  const route = readFileSync(new URL("../src/app/api/admin/earnings/amazon/entry/route.ts", import.meta.url), "utf8");
  assert.match(route, /if \(!\(await allowed\(key\)\)\) return NextResponse\.json\(\{ error: "Not allowed" \}, \{ status: 403 \}\);/);
  assert.match(route, /deleteMany\(\{ where: \{ source: "amazon", currency: store\.currency, day: \{ gte: from, lte: to \} \} \}\)/);
  assert.match(route, /day: to, amountCents: 0, currency: store\.currency, tag: ""/);
  const form = readFileSync(new URL("../src/components/admin/AmazonUploadForm.tsx", import.meta.url), "utf8");
  assert.match(form, /aria-label="Amazon figures"/);
  assert.match(form, /Save figures/);
});

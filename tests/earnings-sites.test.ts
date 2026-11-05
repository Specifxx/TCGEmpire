import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SourceResult } from "../src/lib/earnings/core";
import { siteForProject, siteLedger, vercelCharges } from "../src/lib/earnings/sites";
import { buildGrowthReport, growthReportText } from "../src/lib/earnings/growth-report";
import { isVercelInvoice } from "../src/lib/earnings/costs";

const focus = (o: Record<string, unknown>) =>
  JSON.stringify({ BillingCurrency: "USD", ChargeCategory: "Usage", ServiceName: "Function Invocations", SkuId: "fn", Tags: {}, ...o });

test("the billing export becomes one charge per project and day; domains are left to the hand entries", () => {
  const jsonl = [
    focus({ ChargePeriodStart: "2026-10-28T00:00:00Z", BilledCost: 1.25, Tags: { ProjectId: "prj_1", ProjectName: "riftcompare" } }),
    focus({ ChargePeriodStart: "2026-10-28T00:00:00Z", BilledCost: "0.75", SkuId: "edge", Tags: { ProjectName: "riftcompare" } }),
    focus({ ChargePeriodStart: "2026-10-28T00:00:00Z", BilledCost: 20, ChargeCategory: "Purchase", ServiceName: "Premium plan" }),
    focus({ ChargePeriodStart: "2026-10-28T00:00:00Z", BilledCost: 13, ServiceName: "Domains", SkuId: "domain-renewal" }),
    focus({ ChargePeriodStart: "2026-10-29T00:00:00Z", BilledCost: 0, Tags: { ProjectName: "kaeyoung" } }),
    "not json",
    "",
  ].join("\n");
  assert.deepEqual(vercelCharges(jsonl), [
    { day: "2026-10-28", project: "", currency: "USD", cents: 2000 },
    { day: "2026-10-28", project: "riftcompare", currency: "USD", cents: 200 },
  ]);
});

test("every Vercel project name maps to its site's tag prefix", () => {
  const cases: [string, string][] = [
    ["riftcompare", "rc"],
    ["tcgempire", "rc"],
    ["opcompare", "oc"],
    ["dexcompare-sealed", "dex"],
    ["mtgcompare", "mtg"],
    ["gundamcompare", "gundam"],
    ["lorcanacompare", "lorcana"],
    ["ygocompare", "ygo"],
    ["wargamecompare", "wgc"],
    ["figurecompare", "figure"],
    ["kaeyoung", "ky"],
    ["camcompare", "cc"],
    ["compareempiretake2", "ce"],
    ["", "shared"],
    ["something-new", "project:something-new"],
  ];
  for (const [name, key] of cases) assert.equal(siteForProject(name), key, name);
});

const src = (key: SourceResult["key"], days: SourceResult["days"], tags?: SourceResult["tags"]): SourceResult => ({ key, status: "ok", days, tags, fetchedAt: 0 });

test("each site's earnings minus its own Vercel project, the plan and other costs on the shared row", () => {
  const ebay = src("ebay", [{ day: "2026-10-28", currency: "AUD", cents: 1000 }], [
    { day: "2026-10-28", tag: "rc-us-card_pinned", currency: "AUD", cents: 600, pendingCents: 0, sales: 1 },
    { day: "2026-10-28", tag: "ky-au-product-1", currency: "AUD", cents: 300, pendingCents: 0, sales: 1 },
  ]);
  const stripe = src("stripe", [{ day: "2026-10-28", currency: "AUD", cents: 500 }]);
  const vercel = [
    { day: "2026-10-28", project: "riftcompare", currency: "AUD", cents: 400 },
    { day: "2026-10-28", project: "kaeyoung", currency: "AUD", cents: 50 },
    { day: "2026-10-28", project: "", currency: "AUD", cents: 2000 },
    { day: "2026-09-01", project: "riftcompare", currency: "AUD", cents: 9999 },
  ];
  const rows = siteLedger([ebay, stripe], vercel, [{ day: "2026-10-28", currency: "AUD", cents: 100 }], "2026-10-23", "2026-10-29", "AUD");
  const by = new Map(rows.map((r) => [r.key, r]));
  assert.deepEqual([by.get("rc")!.earned, by.get("rc")!.vercel, by.get("rc")!.net], [1100, 400, 700]);
  assert.deepEqual([by.get("ky")!.earned, by.get("ky")!.vercel, by.get("ky")!.net], [300, 50, 250]);
  assert.equal(by.get("")!.earned, 100, "the untagged rest of eBay's total");
  assert.deepEqual([by.get("shared")!.vercel, by.get("shared")!.other, by.get("shared")!.net], [2000, 100, -2100]);
  assert.equal(by.get("figure")!.net, 0, "a site with nothing is still listed");
  assert.equal(rows.at(-1)!.key, "shared");
  // The rows add up to the dashboard's own profit.
  assert.equal(rows.reduce((n, r) => n + r.net, 0), 1500 - 2450 - 100);
});

test("the growth report carries the per-site table, and says when Vercel is not connected", () => {
  const ebay = src("ebay", [{ day: "2026-10-27", currency: "AUD", cents: 1500 }], [
    { day: "2026-10-27", tag: "oc-us-card", currency: "AUD", cents: 1500, pendingCents: 0, sales: 2 },
  ]);
  const on = growthReportText(buildGrowthReport([ebay], new Map(), "2026-10-30", { vercel: [{ day: "2026-10-27", project: "opcompare", currency: "AUD", cents: 500 }], other: [] }));
  assert.match(on, /COST AND EARNINGS BY SITE/);
  assert.match(on, /OP Compare: last week A?\$15\.00 - A?\$5\.00 = A?\$10\.00/);
  assert.doesNotMatch(on, /not connected \(VERCEL_BILLING_TOKEN/);
  const off = growthReportText(buildGrowthReport([ebay], new Map(), "2026-10-30"));
  assert.match(off, /Vercel per project is not connected/);
});

test("only hand-entered Vercel invoices give way to the billing API, never domains", () => {
  assert.equal(isVercelInvoice("Vercel invoice 2026-09"), true);
  assert.equal(isVercelInvoice("Vercel Premium"), true);
  assert.equal(isVercelInvoice("Domain kaeyoung.com (purchase) via Vercel"), false);
  assert.equal(isVercelInvoice("Claude plan invoice 2026-09"), false);
});

test("the By site table carries each site's all-time earned and net beside the range (owner, 2026-11-03)", () => {
  const page = readFileSync(new URL("../src/app/admin/earnings/page.tsx", import.meta.url), "utf8");
  assert.match(page, /const ledgerAll = siteLedger\(sources, vercelCost\?\.projects \?\? \[\], otherCostDays, EARNINGS_SINCE, today, display\);/);
  assert.match(page, /All-time net<\/th>/);
  assert.match(page, /data-all-time-total/);
  // The all-time ledger is the same function over the whole span, so a site's rows add up.
  const ebay: SourceResult = {
    key: "ebay", status: "ok", fetchedAt: 0,
    days: [{ day: "2026-03-01", currency: "AUD", cents: 500 }, { day: "2026-10-28", currency: "AUD", cents: 300 }],
    tags: [
      { day: "2026-03-01", tag: "rc-au-x", currency: "AUD", cents: 500, pendingCents: 0, sales: 1 },
      { day: "2026-10-28", tag: "rc-au-x", currency: "AUD", cents: 300, pendingCents: 0, sales: 1 },
    ],
  };
  const all = siteLedger([ebay], [{ day: "2026-02-01", project: "tcgempire", currency: "AUD", cents: 1000 }], [], "2026-01-01", "2026-10-29", "AUD");
  assert.equal(all.find((r) => r.key === "rc")?.net, -200, "all-time net is earned minus every cost since the start");
  const recent = siteLedger([ebay], [{ day: "2026-02-01", project: "tcgempire", currency: "AUD", cents: 1000 }], [], "2026-10-23", "2026-10-29", "AUD");
  assert.equal(recent.find((r) => r.key === "rc")?.net, 300);
});

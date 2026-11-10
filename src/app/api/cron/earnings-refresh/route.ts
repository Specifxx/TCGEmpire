import { NextResponse } from "next/server";
import { loadEarnings } from "@/lib/earnings/sources";
import { loadCosts } from "@/lib/earnings/costs";
import { storeAmazonClicks } from "@/lib/earnings/amazon-clicks";
import { storeSearchTest } from "@/lib/earnings/search-test";
import { liveRoute } from "@/lib/public-data/live-route";

// Refreshes the earnings dashboard's stored copy (lib/earnings/stored.ts; DECISIONS.md
// "The earnings dashboard reads a stored copy", 2026-11-06): every reporting API is
// asked once, in parallel, and its answer kept, so /admin/earnings, Empire HQ and the
// owner's emails read figures at most three hours old without waiting on any API.
// Every three hours from vercel.json; the ops monitor's earnings check turns RED when
// a stored copy is over 12 hours old. Answers with status only, never an amount.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handleGET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  const [sources, costs, clicks, search] = await Promise.all([loadEarnings(true), loadCosts(true), storeAmazonClicks(), storeSearchTest()]);
  const status = [...sources.map((s) => ({ key: s.key, status: s.status })), ...costs.filter((c) => !c.entry).map((c) => ({ key: c.key, status: c.status })), { key: "amazon-clicks", status: clicks.status }, { key: "search-test", status: search.status }];
  return NextResponse.json({ ok: status.every((s) => s.status !== "error"), seconds: Math.round((Date.now() - started) / 1000), status });
}

// Every cron route is wrapped (tests/public-data.test.ts); this one reads no public data.
export const GET = liveRoute(handleGET);

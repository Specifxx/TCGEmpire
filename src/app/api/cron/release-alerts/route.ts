import { NextResponse } from "next/server";
import { runReleaseAlerts } from "@/lib/release-alerts-run";

// The set release-alert run (lib/release-alerts.ts). Called by
// .github/workflows/refresh-prices.yml after each scheduled price import, with
// the same Authorization: Bearer <CRON_SECRET> as the price-alert runs.
// ?set=RAD (default RAD, the only set with signups today); ?dry=1 counts
// without sending or writing.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const setCode = (url.searchParams.get("set") ?? "RAD").toUpperCase().slice(0, 8);
  try {
    const summary = await runReleaseAlerts(setCode, { dryRun: url.searchParams.get("dry") === "1" });
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "release alert run failed" }, { status: 500 });
  }
}

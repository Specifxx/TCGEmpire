import { NextResponse } from "next/server";
import { runPriceAlerts } from "@/lib/price-alerts";

// The BASELINE-ONLY alert pass: after a push-triggered price re-import,
// .github/workflows/refresh-prices.yml calls this instead of the alert runs.
// A push re-import follows a matcher change, so its price moves are matching
// fixes, not market news. This moves every priced watch's baseline to the new
// alert price and sends NOTHING (lib/price-alerts.ts AlertRunOptions
// baselineOnly); without it the next scheduled run compared against the
// pre-push baseline and emailed every matching fix (review, 2026-09-25).
//
// Its own path, like ./paid: the deployed parent route ignores unknown query
// strings, so a query form would have run a full "all" run WITH emails until
// the next deploy. This path 404s until the deploy that adds it, and can only
// ever run the baseline pass. Same Authorization: Bearer <CRON_SECRET>.
export const dynamic = "force-dynamic";
export const maxDuration = 120; // seconds

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await runPriceAlerts({}, { baselineOnly: true });
    return NextResponse.json({ ok: true, scope: "baseline", ...summary });
  } catch (e) {
    const message = e instanceof Error ? e.message : "alert baseline pass failed";
    return NextResponse.json({ ok: false, scope: "baseline", error: message }, { status: 500 });
  }
}

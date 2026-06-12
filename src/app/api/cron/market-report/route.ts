import { NextResponse } from "next/server";
import { ensureMarketReport } from "@/lib/market-report";
import { pingAfterMarketReport } from "@/lib/indexnow";

// Generates the day's automated market report. Triggered by the Vercel cron (see
// vercel.json) at Wall Street pre-market open, or any scheduler hitting this URL
// with Authorization: Bearer <CRON_SECRET>. Idempotent — safe to call repeatedly.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await ensureMarketReport();
    if (!result) return NextResponse.json({ ok: true, generated: false, reason: "no index data yet" });
    // Ping IndexNow whether or not THIS call created the row: the self-heal on
    // /blog may have created it first, and today's post + the blog index are
    // fresh content either way. Best-effort; never fails the cron.
    const indexnow = await pingAfterMarketReport(result.slug);
    return NextResponse.json({ ok: true, indexnow, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "report failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

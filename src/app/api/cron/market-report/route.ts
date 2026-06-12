import { NextResponse } from "next/server";
import { ensureMarketReport } from "@/lib/market-report";

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
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "report failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { runPriceAlerts } from "@/lib/price-alerts";

// Daily wishlist price-drop check. Triggered by Vercel Cron (see vercel.json) or
// any scheduler hitting this URL with the Authorization: Bearer <CRON_SECRET>
// header. Scheduled just after the price importer so it compares against fresh
// lowest prices.
export const dynamic = "force-dynamic";
export const maxDuration = 120; // seconds

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await runPriceAlerts();
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    const message = e instanceof Error ? e.message : "alert run failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

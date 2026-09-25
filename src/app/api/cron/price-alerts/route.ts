import { NextResponse } from "next/server";
import { runPriceAlerts, type AlertScope } from "@/lib/price-alerts";

// Wishlist price-alert check. Two callers, both with the
// Authorization: Bearer <CRON_SECRET> header:
//   • Vercel Cron (vercel.json), once a day, no query → scope "all": every
//     watch, free and anonymous included, under the weekly per-address cap.
//   • .github/workflows/refresh-prices.yml, right after each of the two daily
//     price imports, with ?scope=paid → only watches owned by a Plus/Premium
//     account, so target-price and below-market alerts follow every price
//     update (lib/price-alerts.ts AlertScope).
// Any other scope value is treated as "all", the pre-lineup behaviour.
export const dynamic = "force-dynamic";
export const maxDuration = 120; // seconds

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const scope: AlertScope = new URL(req.url).searchParams.get("scope") === "paid" ? "paid" : "all";
  try {
    const summary = await runPriceAlerts({}, { scope });
    return NextResponse.json({ ok: true, scope, ...summary });
  } catch (e) {
    const message = e instanceof Error ? e.message : "alert run failed";
    return NextResponse.json({ ok: false, scope, error: message }, { status: 500 });
  }
}

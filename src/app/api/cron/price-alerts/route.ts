import { NextResponse } from "next/server";
import { runPriceAlerts, type AlertScope } from "@/lib/price-alerts";

// Wishlist price-alert check. Two callers, both with the
// Authorization: Bearer <CRON_SECRET> header:
//   • Vercel Cron (vercel.json), once a day, no query → scope "all": every
//     watch, free and anonymous included, under the weekly per-address cap.
//   • ?scope=paid → only watches owned by a Plus/Premium account
//     (lib/price-alerts.ts AlertScope), for a manual run. The scheduled paid
//     runs after each price import call ./paid/route.ts instead — the
//     pre-lineup deployment of THIS route ignores the query, so a workflow
//     calling it here before the deploy would have run "all" (see there).
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

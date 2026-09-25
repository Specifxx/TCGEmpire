import { NextResponse } from "next/server";
import { runPriceAlerts } from "@/lib/price-alerts";

// The PAID alert run: target-price and below-market alerts for watches owned
// by a Plus/Premium account (lib/price-alerts.ts AlertScope "paid"). Called by
// .github/workflows/refresh-prices.yml right after each of the two daily price
// imports, with the same Authorization: Bearer <CRON_SECRET> as the Vercel
// cron.
//
// WHY ITS OWN PATH, NOT ?scope=paid ON THE PARENT ROUTE. A workflow change
// takes effect the moment it lands on main; the route only goes live at the
// next daily 08:00 UTC deploy (CLAUDE.md). The deployed parent route before
// this change ignores any query string, so a step calling
// /api/cron/price-alerts?scope=paid in that window ran a full "all" run —
// free and anonymous watches, FIRST_PRICE_SEND_CAP and the weekly digests —
// after every import, on the shared 100/day Resend quota. This path simply
// 404s until the deploy that adds it, and then can only ever run "paid".
export const dynamic = "force-dynamic";
export const maxDuration = 120; // seconds

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await runPriceAlerts({}, { scope: "paid" });
    return NextResponse.json({ ok: true, scope: "paid", ...summary });
  } catch (e) {
    const message = e instanceof Error ? e.message : "alert run failed";
    return NextResponse.json({ ok: false, scope: "paid", error: message }, { status: 500 });
  }
}

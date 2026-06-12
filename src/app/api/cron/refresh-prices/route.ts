import { NextResponse } from "next/server";
import { importPrices } from "@/lib/price-import";
import { pingAfterPriceRefresh } from "@/lib/indexnow";

// Scheduled price refresh. Triggered by Vercel Cron (see vercel.json) or any
// scheduler hitting this URL with the Authorization: Bearer <CRON_SECRET> header.
//
// Heavy job (fetches several stores) — give it a long timeout on the host.
export const dynamic = "force-dynamic";
export const maxDuration = 300; // seconds (requires a plan that allows it)

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  // Vercel Cron sends "Authorization: Bearer <CRON_SECRET>" when the env var is set.
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await importPrices();
    // Fresh prices = fresh page content: tell IndexNow-capable engines to recrawl
    // (best-effort — a failed ping never fails the refresh).
    const indexnow = await pingAfterPriceRefresh();
    return NextResponse.json({ ok: true, indexnow, ...summary });
  } catch (e) {
    const message = e instanceof Error ? e.message : "import failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

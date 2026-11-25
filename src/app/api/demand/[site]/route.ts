import { NextResponse } from "next/server";
import { isDemandSite, loadItemDemand } from "@/lib/analytics/item-demand";
import { loadTrafficAudit } from "@/lib/analytics/traffic-audit";

export const dynamic = "force-dynamic";

// Per-item demand for one site's home page ranking (src/lib/analytics/item-demand.ts): product page views and buy_product
// clicks, last 28 and 7 days. Public counts only. The CDN holds an answer six hours (each site's data job reads it once a day);
// a failure is held a minute, never six hours.
// ?audit=1: the site's traffic by referrer, country, device, OS and browser, and its buy_click count (lib/analytics/traffic-audit.ts),
// for the bot-or-human audit; the same counts-only rule and the same cache.
export async function GET(req: Request, { params }: { params: { site: string } }) {
  if (!isDemandSite(params.site)) return NextResponse.json({ error: "Unknown site" }, { status: 404 });
  const audit = new URL(req.url).searchParams.get("audit") === "1";
  const data = audit ? await loadTrafficAudit(params.site) : await loadItemDemand(params.site);
  const good = data.status === "ok" || data.status === "partial";
  const cache = good ? "public, s-maxage=21600, stale-while-revalidate=86400" : "public, s-maxage=60";
  return NextResponse.json(data, { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": cache, "Vercel-CDN-Cache-Control": cache } });
}

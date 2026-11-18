import { NextResponse } from "next/server";
import { isDemandSite, loadItemDemand } from "@/lib/analytics/item-demand";

export const dynamic = "force-dynamic";

// Per-item demand for one site's home page ranking (src/lib/analytics/item-demand.ts): product page views and buy_product
// clicks, last 28 and 7 days. Public counts only. The CDN holds an answer six hours (each site's data job reads it once a day);
// a failure is held a minute, never six hours.
export async function GET(_req: Request, { params }: { params: { site: string } }) {
  if (!isDemandSite(params.site)) return NextResponse.json({ error: "Unknown site" }, { status: 404 });
  const data = await loadItemDemand(params.site);
  const good = data.status === "ok" || data.status === "partial";
  const cache = good ? "public, s-maxage=21600, stale-while-revalidate=86400" : "public, s-maxage=60";
  return NextResponse.json(data, { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": cache, "Vercel-CDN-Cache-Control": cache } });
}

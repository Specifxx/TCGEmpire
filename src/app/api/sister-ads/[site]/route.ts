import { NextResponse } from "next/server";
import { sisterSite } from "@/lib/sister-alerts/sites";
import { liveAds } from "@/lib/sister-ads/server";

export const dynamic = "force-dynamic";

// The approved featured listings one sister site may draw (public, ad fields
// only, no email). Cached by the CDN for six hours; the site's banner filters
// by each ad's own start and end, so an ad comes down on time regardless. Open
// CORS: it is public data and the sites call it from the browser.
export async function GET(_req: Request, { params }: { params: { site: string } }) {
  const site = sisterSite(params.site);
  if (!site) return NextResponse.json({ error: "Unknown site" }, { status: 404 });
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
    "Vercel-CDN-Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
  };
  try {
    return NextResponse.json({ ads: await liveAds(site.key) }, { headers });
  } catch {
    // Never cache a failure for six hours.
    return NextResponse.json({ ads: [] }, { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, s-maxage=60" } });
  }
}

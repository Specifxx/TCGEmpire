import { getSiteReviews } from "@/lib/site-reviews/read";
import { reviewSite } from "@/lib/site-reviews/sites";

// ONE SISTER SITE'S PUBLIC SCORE AND APPROVED REVIEWS (lib/site-reviews/read.ts),
// read by that site's pages in the browser. Public data with no credentials,
// so any origin may read it. The CDN keeps it six hours (the sister sites'
// cached-page floor), so a busy day costs each site a handful of function runs
// and two small reads; a new rating or approval shows within six hours.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { site: string } }) {
  const site = reviewSite(params.site);
  if (!site) return Response.json({ error: "Unknown site" }, { status: 404, headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, s-maxage=86400" } });
  const payload = await getSiteReviews(site.key);
  return Response.json(
    { ...payload, name: site.name },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "X-Robots-Tag": "noindex",
        "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
      },
    },
  );
}

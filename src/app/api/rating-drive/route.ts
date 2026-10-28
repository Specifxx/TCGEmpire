import { getSiteRating } from "@/lib/site-rating";
import { RATING_DRIVE_TARGET, ratingDriveActive } from "@/lib/rate-prompt";

// Is the rating drive on? (lib/rate-prompt.ts, "THE RATING DRIVE".) The client
// asks once per visit. One aggregate behind getSiteRating's six-hour memo, and
// the CDN keeps the answer six hours, so a busy day costs a handful of reads.
// The drive ends at most ~12 hours after the 100th rating. Any error is "off".
export const dynamic = "force-dynamic";

export async function GET() {
  const rating = await getSiteRating().catch(() => null);
  const count = rating?.count ?? null;
  return Response.json(
    { active: ratingDriveActive(count), count, target: RATING_DRIVE_TARGET },
    {
      headers: {
        "X-Robots-Tag": "noindex",
        "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=21600",
      },
    },
  );
}

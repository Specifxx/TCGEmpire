import { getPullTally } from "@/lib/pull-rates-server";

export const dynamic = "force-dynamic";

// The public community pull tally (lib/pull-rates.ts): per set, packs, logs and members, and tier and card
// counts only once a set is published. For the ops monitor and anyone curious; the CDN keeps it six hours.
export async function GET() {
  const tally = await getPullTally();
  return Response.json(tally, {
    headers: { "X-Robots-Tag": "noindex", "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" },
  });
}

import { getCardPricesData } from "@/lib/public-api";

// Public, machine-readable per-region lowest prices for one card.
// Agent/dashboard friendly; referenced from the card page and llms.txt. `?id`
// accepts slug or id. The query + response shape live in lib/public-api.ts's
// getCardPricesData. Six hours, at the CDN too (15 minutes until 2026-10-14,
// DECISIONS.md, "Cached pages refresh every 6 to 24 hours", 2026-10-14).
export const revalidate = 21600;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const body = await getCardPricesData(params.id);
  if (!body) return Response.json({ error: "not_found", id: params.id }, { status: 404, headers: { "X-Robots-Tag": "noindex" } });

  return Response.json(body, {
    headers: {
      "X-Robots-Tag": "noindex",
      "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

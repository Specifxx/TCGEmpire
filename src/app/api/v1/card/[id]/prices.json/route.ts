import { getCardPricesData } from "@/lib/public-api";

// Public, machine-readable per-region lowest prices for one card. Agent/dashboard
// friendly; referenced from the card page and llms.txt. `?id` accepts slug or id.
// The query + response shape live in lib/public-api.ts's getCardPricesData,
// shared with the MCP get_card_prices tool so the two can't drift apart.
export const revalidate = 900;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const body = await getCardPricesData(params.id);
  if (!body) return Response.json({ error: "not_found", id: params.id }, { status: 404, headers: { "X-Robots-Tag": "noindex" } });

  return Response.json(body, {
    headers: {
      "X-Robots-Tag": "noindex",
      "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

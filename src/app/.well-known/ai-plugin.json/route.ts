import { SITE_URL } from "@/lib/site";

// OpenAI plugin manifest convention (openai.com/.well-known/ai-plugin.json).
// OpenAI itself retired the ChatGPT plugin store this manifest was built for,
// but the shape is still checked by a number of agent frameworks/tool-loaders
// as a generic "does this site describe an API" signal, and it costs nothing
// to keep serving alongside the MCP manifest below — it points at the exact
// same OpenAPI description either way.
export const revalidate = 86400;

export function GET() {
  return Response.json(
    {
      schema_version: "v1",
      name_for_human: "RiftCompare",
      name_for_model: "riftcompare",
      description_for_human:
        "Compare live Riftbound: League of Legends TCG card prices across stores in Australia, New Zealand, " +
        "the US, the UK, Singapore and Canada, including real shipping cost.",
      description_for_model:
        "Read-only Riftbound TCG price data: card search, per-card prices in every market, the full " +
        "store-by-store listing comparison (item price + shipping = total delivered cost) so you can find the " +
        "cheapest place to buy a card, sealed-product prices, and the RiftCompare Index (a daily market index " +
        "for Riftbound singles). No authentication required.",
      auth: { type: "none" },
      api: { type: "openapi", url: `${SITE_URL}/openapi.json`, is_user_authenticated: false },
      logo_url: `${SITE_URL}/icon.png`,
      contact_email: "riftcompare@gmail.com",
      legal_info_url: `${SITE_URL}/terms`,
    },
    { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, s-maxage=86400" } },
  );
}

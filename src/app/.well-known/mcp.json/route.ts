import { SITE_URL } from "@/lib/site";

// MCP server discovery manifest. There is no single ratified .well-known
// location/shape for this yet — the Model Context Protocol spec itself doesn't
// mandate one — so this follows the community .well-known/mcp.json convention
// (a handful of MCP directories/registries already look for it) rather than an
// official standard. The one thing that IS load-bearing is the server url +
// transport below; everything else is descriptive.
export const revalidate = 86400;

export function GET() {
  return Response.json(
    {
      mcpVersion: "2025-06-18",
      servers: [
        {
          name: "riftcompare",
          description:
            "Read-only Riftbound: League of Legends TCG price data — card search, per-market prices, " +
            "store-by-store listings ranked by total delivered cost, and the sets list.",
          url: `${SITE_URL}/api/mcp`,
          transport: "streamable-http",
          auth: { type: "none" },
          tools: ["search_cards", "get_card_prices", "cheapest_listing", "list_sets"],
        },
      ],
      // Also described as an OpenAPI 3.1 REST API, for a client that prefers that over MCP.
      openapi: `${SITE_URL}/openapi.json`,
    },
    { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, s-maxage=86400" } },
  );
}

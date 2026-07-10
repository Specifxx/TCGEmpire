import { SITE_URL } from "@/lib/site";

// OpenAPI 3.1 description of the public RiftCompare data API. Agent frameworks (and
// MCP servers that import OpenAPI) use this to call the endpoints as tools. Static.
export const revalidate = 86400;

export function GET() {
  const spec = {
    openapi: "3.1.0",
    info: {
      title: "RiftCompare Data API",
      version: "1.0.0",
      description:
        "Public, read-only Riftbound: League of Legends TCG price data — the RiftCompare Index and per-card lowest prices by market. Free to use with attribution to RiftCompare.",
      contact: { url: `${SITE_URL}/market#cite` },
    },
    servers: [{ url: `${SITE_URL}/api/v1` }],
    paths: {
      "/index.json": {
        get: {
          operationId: "getIndex",
          summary: "The RiftCompare Index (level, deltas, stats, constituents).",
          parameters: [
            {
              name: "market",
              in: "query",
              required: false,
              schema: { type: "string", enum: ["GLOBAL", "AU", "NZ", "US", "UK", "SG"], default: "GLOBAL" },
              description: "Market scope; GLOBAL is a currency-agnostic composite.",
            },
          ],
          responses: { "200": { description: "The index snapshot", content: { "application/json": {} } } },
        },
      },
      "/card/{id}/prices.json": {
        get: {
          operationId: "getCardPrices",
          summary: "Lowest live in-stock price per market (AU/NZ/US/UK) for one card.",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "The card slug (e.g. 'vayne-hunter-sfd-223-221') or id.",
            },
          ],
          responses: {
            "200": { description: "Per-market prices", content: { "application/json": {} } },
            "404": { description: "Card not found" },
          },
        },
      },
    },
  };

  return Response.json(spec, {
    headers: { "X-Robots-Tag": "noindex", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, s-maxage=86400" },
  });
}

import { SITE_URL } from "@/lib/site";

// OpenAPI 3.1 description of the public RiftCompare data API. Agent frameworks (and
// MCP servers that import OpenAPI) use this to call the endpoints as tools. Static.
export const revalidate = 86400;

// Shared by every per-market (non-index) route below — unlike /index.json's market
// parameter, these have no GLOBAL composite scope, just a real market to query.
const MARKET_PARAM_SINGLE = {
  name: "market",
  in: "query",
  required: false,
  schema: { type: "string", enum: ["AU", "NZ", "US", "UK", "SG", "CA"], default: "US" },
  description: "Market scope.",
};

export function GET() {
  const spec = {
    openapi: "3.1.0",
    info: {
      title: "RiftCompare Data API",
      version: "1.0.0",
      description:
        "Public, read-only Riftbound: League of Legends TCG price data — the RiftCompare Index, whole-catalog price summaries, per-card history and store-by-store listings, and sealed-product prices, all by market. Free to use with attribution to RiftCompare.",
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
              schema: { type: "string", enum: ["GLOBAL", "AU", "NZ", "US", "UK", "SG", "CA"], default: "GLOBAL" },
              description: "Market scope; GLOBAL is a currency-agnostic composite.",
            },
          ],
          responses: { "200": { description: "The index snapshot", content: { "application/json": {} } } },
        },
      },
      "/card/{id}/prices.json": {
        get: {
          operationId: "getCardPrices",
          summary: "Lowest live in-stock price per market (AU/NZ/US/UK/SG/CA) for one card.",
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
      "/cards.json": {
        get: {
          operationId: "getCardsSummary",
          summary: "Whole-catalog price summary for one market: latest price + 1/7/30-day deltas + high/low per card.",
          parameters: [MARKET_PARAM_SINGLE],
          responses: { "200": { description: "Per-card summaries", content: { "application/json": {} } } },
        },
      },
      "/card/{id}/history.json": {
        get: {
          operationId: "getCardHistory",
          summary: "Daily price series for one card, in one market.",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "The card slug or id.",
            },
            MARKET_PARAM_SINGLE,
          ],
          responses: {
            "200": { description: "Daily points", content: { "application/json": {} } },
            "404": { description: "Card not found" },
          },
        },
      },
      "/card/{id}/listings.json": {
        get: {
          operationId: "getCardListings",
          summary: "Every tracked store's live listing for one card, in one market — the full price-comparison table.",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "The card slug or id.",
            },
            MARKET_PARAM_SINGLE,
          ],
          responses: {
            "200": { description: "Per-store listings", content: { "application/json": {} } },
            "404": { description: "Card not found" },
          },
        },
      },
      "/sealed.json": {
        get: {
          operationId: "getSealedGroups",
          summary: "Sealed-product (booster box/pack/bundle) groups for one market, cheapest store per product.",
          parameters: [MARKET_PARAM_SINGLE],
          responses: { "200": { description: "Sealed product groups", content: { "application/json": {} } } },
        },
      },
    },
  };

  return Response.json(spec, {
    headers: { "X-Robots-Tag": "noindex", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, s-maxage=86400" },
  });
}

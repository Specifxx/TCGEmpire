import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { prisma } from "@/lib/db";
import { buildCardWhere, buildCardOrderBy, cardTileSelect, type CardQuery } from "@/lib/cards";
import { getCardPricesData, getCardListingsData } from "@/lib/public-api";
import { normalizeCountry, type Country } from "@/lib/country";
import { SETS } from "@/lib/constants";
import { SITE_URL } from "@/lib/site";

// Read-only MCP server (Streamable HTTP transport) wrapping the same public data
// API described at /openapi.json — see that spec and /api/docs for the REST
// shape each tool below returns. Every tool calls the SAME lib functions the
// REST routes use (lib/cards.ts's query builders, lib/public-api.ts's
// getCardPricesData/getCardListingsData), so there is exactly one
// implementation of each query, not one per surface.
//
// STATELESS by design (sessionIdGenerator: undefined): a fresh McpServer +
// transport per request, nothing kept in memory between calls. This app runs
// on Vercel serverless, where a long-lived in-memory session can't be relied
// on to survive to the next request anyway — stateless is the documented,
// supported mode for exactly this deployment shape (see
// WebStandardStreamableHTTPServerTransportOptions.sessionIdGenerator's own
// doc comment in the SDK).
export const dynamic = "force-dynamic";

const MARKET_ENUM = ["AU", "US", "UK", "SG", "CA", "DE"] as const;
const marketSchema = z.enum(MARKET_ENUM).default("US").describe("Market scope — determines currency, in-stock stores and shipping estimates.");

function json(value: unknown, isError = false) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }], isError };
}

function buildServer(): McpServer {
  const server = new McpServer({ name: "riftcompare", version: "1.0.0" });

  server.registerTool(
    "search_cards",
    {
      title: "Search Riftbound cards",
      description:
        "Free-text search over the Riftbound: League of Legends TCG card database, with optional facet filters " +
        "and a market-scoped price column. Same query the /browse page and GET /api/cards run.",
      inputSchema: {
        query: z.string().optional().describe("Free-text search — card name or collector number."),
        market: marketSchema,
        domain: z.string().optional().describe("Fury | Calm | Mind | Body | Chaos | Order."),
        rarity: z.string().optional(),
        type: z.string().optional().describe("Unit | Spell | Gear | Rune | Battlefield | Legend."),
        set: z.string().optional().describe("Set code, e.g. \"VEN\"."),
        limit: z.number().int().min(1).max(50).default(20),
      },
    },
    async ({ query, market, domain, rarity, type, set, limit }) => {
      const country = normalizeCountry(market);
      const cardQuery: CardQuery = { q: query, domain, rarity, type, set };
      const where = buildCardWhere(cardQuery, country);
      const orderBy = buildCardOrderBy(undefined, country);
      const cards = await prisma.card.findMany({ where, orderBy, select: cardTileSelect(country), take: limit });
      return json({ market: country, count: cards.length, cards });
    },
  );

  server.registerTool(
    "get_card_prices",
    {
      title: "Get a card's price in every market",
      description: "Lowest live in-stock price for one card in all six markets (AU/US/UK/SG/CA/DE) at once.",
      inputSchema: { id: z.string().describe("Card URL slug (e.g. \"vayne-hunter-sfd-223-221\") or its raw id.") },
    },
    async ({ id }) => {
      const data = await getCardPricesData(id);
      return data ? json(data) : json({ error: "not_found", id }, true);
    },
  );

  server.registerTool(
    "cheapest_listing",
    {
      title: "Find the cheapest listing for a card",
      description:
        "Every tracked store's live listing for one card in one market, cheapest total delivered cost " +
        "(item price + shipping) first — the tool for \"where's the cheapest place to buy X.\"",
      inputSchema: { id: z.string().describe("Card URL slug or id."), market: marketSchema },
    },
    async ({ id, market }) => {
      const data = await getCardListingsData(id, normalizeCountry(market) as Country);
      return data ? json(data) : json({ error: "not_found", id }, true);
    },
  );

  server.registerTool(
    "list_sets",
    {
      title: "List Riftbound sets",
      description: "Every Riftbound: League of Legends TCG set RiftCompare tracks, released or announced.",
      inputSchema: {},
    },
    async () => {
      const sets = SETS.map((s) => ({
        code: s.code,
        name: s.name,
        url: `${SITE_URL}/sets/${s.slug}`,
        totalCards: s.totalCards ?? null,
        comingSoon: !!s.comingSoon,
        releasedOn: s.releasedOn ?? null,
      }));
      return json({ sets });
    },
  );

  return server;
}

async function handle(req: Request): Promise<Response> {
  const server = buildServer();
  // No session persistence to close later (stateless mode) — the transport is
  // scoped to this one request/response pair and discarded with it.
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(req);
}

export { handle as GET, handle as POST, handle as DELETE };

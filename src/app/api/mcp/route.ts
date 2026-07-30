import { getMarketIndex, type MarketScope } from "@/lib/market-index";
import { COUNTRIES } from "@/lib/country";
import { prisma } from "@/lib/db";
import { cardHref } from "@/lib/card-url";
import { SITE_URL } from "@/lib/site";

// Minimal Model Context Protocol server (beta) over Streamable HTTP: MCP clients
// (Claude Desktop, Cursor, agent frameworks) POST JSON-RPC 2.0 messages here to read
// RiftCompare price data as tools. Non-streaming request/response only (each POST
// returns a single JSON-RPC response) — enough for these read-only tools.
export const dynamic = "force-dynamic";

const PROTOCOL_VERSION = "2024-11-05";

const TOOLS = [
  {
    name: "get_index",
    description:
      "Get the RiftCompare Index (a daily market index for Riftbound: League of Legends TCG singles): level (base 100), deltas, key stats and constituents. Optional market GLOBAL|AU|NZ|US|UK|SG|CA.",
    inputSchema: {
      type: "object",
      properties: { market: { type: "string", enum: ["GLOBAL", "AU", "NZ", "US", "UK", "SG", "CA"] } },
      additionalProperties: false,
    },
  },
  {
    name: "get_card_prices",
    description: "Get the lowest live in-stock price per market (AU/NZ/US/UK/SG/CA) for a Riftbound card, by slug or id.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Card slug or id" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
];

function parseMarket(v: unknown): MarketScope {
  const up = String(v ?? "").toUpperCase();
  // Registry-driven so a new market can't silently fall through to GLOBAL.
  return up in COUNTRIES ? (up as MarketScope) : "GLOBAL";
}

async function callTool(name: string, args: Record<string, unknown> | undefined): Promise<unknown> {
  if (name === "get_index") {
    const index = await getMarketIndex(parseMarket(args?.market)).catch(() => null);
    if (!index) return { error: "index_unavailable" };
    return {
      market: index.market,
      level: index.latest,
      currency: index.currency,
      startDay: index.startDay,
      change: { d1: index.d1, d7: index.d7, d30: index.d30, sinceStart: index.sinceStart },
      stats: index.stats,
      source: `${SITE_URL}/market`,
    };
  }
  if (name === "get_card_prices") {
    const id = String(args?.id ?? "");
    if (!id) return { error: "missing_id" };
    const card = await prisma.card
      .findFirst({
        where: { OR: [{ slug: id }, { id }] },
        select: {
          id: true, slug: true, name: true, setName: true, setCode: true, collectorNumber: true,
          lowestPriceCents: true, lowestPriceCentsNz: true, lowestPriceCentsUs: true, lowestPriceCentsUk: true, lowestPriceCentsSg: true, lowestPriceCentsCa: true,
        },
      })
      .catch(() => null);
    if (!card) return { error: "not_found", id };
    return {
      card: { name: card.name, set: card.setName, setCode: card.setCode, collectorNumber: card.collectorNumber, url: `${SITE_URL}${cardHref(card)}` },
      prices: {
        AU: { lowestCents: card.lowestPriceCents, currency: "AUD" },
        NZ: { lowestCents: card.lowestPriceCentsNz, currency: "NZD" },
        US: { lowestCents: card.lowestPriceCentsUs, currency: "USD" },
        UK: { lowestCents: card.lowestPriceCentsUk, currency: "GBP" },
        SG: { lowestCents: card.lowestPriceCentsSg, currency: "SGD" },
        CA: { lowestCents: card.lowestPriceCentsCa, currency: "CAD" },
      },
    };
  }
  throw new Error(`unknown tool: ${name}`);
}

const ok = (id: unknown, result: unknown) => Response.json({ jsonrpc: "2.0", id, result });
const err = (id: unknown, code: number, message: string) =>
  Response.json({ jsonrpc: "2.0", id, error: { code, message } });

export async function POST(req: Request) {
  let msg: any;
  try {
    msg = await req.json();
  } catch {
    return err(null, -32700, "Parse error");
  }
  const { id, method, params } = msg ?? {};
  // JSON-RPC notifications (no id, e.g. notifications/initialized) get no response.
  if (id === undefined || id === null) return new Response(null, { status: 202 });

  try {
    if (method === "initialize")
      return ok(id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: { listChanged: false } }, serverInfo: { name: "riftcompare", version: "1.0.0" } });
    if (method === "ping") return ok(id, {});
    if (method === "tools/list") return ok(id, { tools: TOOLS });
    if (method === "tools/call") {
      const result = await callTool(params?.name, params?.arguments);
      const isError = !!(result && typeof result === "object" && "error" in (result as object));
      return ok(id, { content: [{ type: "text", text: JSON.stringify(result) }], isError });
    }
    return err(id, -32601, `Method not found: ${method}`);
  } catch (e) {
    return err(id, -32603, e instanceof Error ? e.message : "Internal error");
  }
}

// A plain GET describes the server (handy for humans / discovery).
export function GET() {
  return Response.json(
    {
      name: "riftcompare-mcp",
      version: "1.0.0",
      transport: "Streamable HTTP — POST JSON-RPC 2.0 (initialize, tools/list, tools/call)",
      tools: TOOLS.map((t) => t.name),
      docs: `${SITE_URL}/api/v1/openapi.json`,
    },
    { headers: { "X-Robots-Tag": "noindex" } }
  );
}

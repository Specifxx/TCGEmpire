import { NAV_GROUPS } from "@/components/nav-groups";
import { SITE_URL, tierMonthlyAmount } from "@/lib/site";

// llms.txt — the AI-agent site map (spec: llmstxt.org). A curated, markdown index
// of the site's most useful pages so LLMs/agents can navigate without parsing HTML.
// Served at /llms.txt. Mirrors the feed.xml route-handler pattern (plain-text GET).
export const revalidate = 86400;

// One-line descriptions for the hub pages (falls back to the nav label otherwise).
const DESC: Record<string, string> = {
  "/browse": "Every Riftbound card with live lowest prices compared across stores (AU/US/UK/SG/CA/EU).",
  "/sealed": "Sealed products — booster boxes, packs and bundles — with the cheapest live price.",
  "/movers": "The biggest Riftbound price rises and falls, week over week.",
  "/market": "The RiftCompare Index — a daily search-weighted market index for Riftbound singles, with key stats.",
  "/stores/tracked": "The stores whose public prices RiftCompare tracks and compares.",
  "/tools/deal-finder": "Deal Finder: every card cheaper than TCGplayer's US market price at a real store, with a store filter and an eBay-only view. The top 3 with a free account; the full list, filterable to your watchlist or binder, with Plus.",
  "/tools/rising": "Ranks cards by search demand, stores in stock and where the price sits in its own recent range, with the reason for each pick. A screen, not a prediction; not financial advice.",
  "/tools/best-basket": "Best Basket: the cheapest delivered order for a list of cards across your country's stores, postage and free-shipping thresholds included, beside the best one-store and two-store orders. Your own total with a free account; the store-by-store plan with Premium.",
  "/tools/demand": "Demand Finder: the Riftbound cards most searched and most viewed on RiftCompare over the last 7 or 30 days, counted once per browser per card per day. The top 10 most searched this week are free (also on /movers); the full lists with Premium.",
  "/tools/box-ev": "Booster-box expected value: the pull value of a sealed box vs its price.",
  "/tools/selling-fees": "Net proceeds calculator for selling on TCGplayer or eBay: stacks commission, processing and shipping.",
  "/deck": "Deck builder and list pricer — paste a decklist or any card list and price every card in real time.",
  "/trade": "Trade calculator — value two sides of a card trade fairly.",
  "/riftle": "Riftle — the daily Riftbound card guessing game.",
  "/games": "Free Riftbound mini-games (Riftle, pack sim, price games and more).",
  "/learn": "Learn Riftbound: an interactive new-player guide with real cards.",
  "/guides": "Buying guides and strategy articles for Riftbound.",
  "/blog": "News, metagame snapshots and buying guides for Riftbound.",
  "/portfolio": "Track a collection's value over time.",
  "/premium": `Plus (${tierMonthlyAmount("plus")}/mo): no ads on any page, target-price alerts, and the full Deal Finder and Rising Cards lists. Premium (${tierMonthlyAmount("premium")}/mo): everything in Plus, plus Best Basket's store-by-store plan, Buy this list for a deck, watchlist or binder, and the full Demand Finder (most searched and most viewed cards).`,
  "/sets": "Every Riftbound set with its full card list and live prices.",
  "/champions": "Browse Riftbound cards by League of Legends champion.",
  "/cards": "Card facets — browse by type, rarity and printing (Signature, Overnumbered, Alternate Art, Promo).",
  "/domains": "The Riftbound domains (Fury, Calm, Mind, Body, Chaos, Order, Colorless) and their cards.",
  "/keywords": "Riftbound keywords and game actions, defined, with every card that uses them.",
  "/singles": "Riftbound singles — the cheapest live price for individual cards.",
  "/alerts": "Watchlists and price alerts — be told when a Riftbound card hits your price.",
  "/tools": "Every RiftCompare tool and calculator in one place.",
};

// Most NAV_GROUPS hrefs are site-relative paths; the Discord link (external:
// true) is already an absolute URL and must pass through unchanged, or this
// would produce "https://riftcompare.comhttps://discord.gg/...".
const abs = (p: string) => (/^https?:\/\//i.test(p) ? p : `${SITE_URL}${p}`);

export function GET() {
  const lines: string[] = [];
  lines.push("# RiftCompare");
  lines.push("");
  lines.push(
    "> Free Riftbound: League of Legends TCG card database and live price comparison across " +
      "the United States, the United Kingdom, Australia, Canada and Singapore — with the " +
      "transparent total cost including shipping, and no hidden fees. Home of the RiftCompare " +
      "Index (a daily market index for Riftbound singles), price movers, sealed products and buyer tools."
  );
  lines.push("");
  lines.push(
    "For AI agents: clean markdown versions of key pages live under `/llm/` — e.g. " +
      "`/llm/market`, `/llm/card/<id>`, `/llm/blog/<slug>` and `/llm/guides/<slug>` (also linked from each page as " +
      "`rel=alternate type=text/markdown`). Every page carries JSON-LD structured data, and the " +
      "RiftCompare Index is available as JSON (see Data)."
  );
  lines.push("");

  // Machine-readable data endpoints first — the highest-value surface for agents.
  lines.push("## Data (machine-readable)");
  lines.push(`- [RiftCompare Index (JSON)](${abs("/api/v1/index.json")}): the live index level, deltas, key stats and constituents.`);
  lines.push(`- [Per-card prices (JSON)](${abs("/api/v1/card/<id>/prices.json")}): every tracked store's live price for one card, all five markets.`);
  lines.push(`- [Per-card listings (JSON)](${abs("/api/v1/card/<id>/listings.json")}?market=US): every store's listing for one card, cheapest total delivered cost first — pass \`?market=\`.`);
  lines.push(`- [Card search (JSON)](${abs("/api/cards")}?q=<query>&market=US): free-text search with filters and pagination — pass \`?market=\` for a deterministic, cacheable, cross-origin response.`);
  lines.push(`- [OpenAPI spec](${abs("/openapi.json")}) · [API reference](${abs("/api/docs")}): every endpoint above, described with request/response schemas — no API key required, no rate limit currently enforced.`);
  lines.push(`- [MCP server](${abs("/api/mcp")}) (Streamable HTTP, no auth): \`search_cards\`, \`get_card_prices\`, \`cheapest_listing\`, \`list_sets\` — the same data as tool calls instead of HTTP requests. Discovery manifests: [${abs("/.well-known/mcp.json")}](${abs("/.well-known/mcp.json")}) · [${abs("/.well-known/ai-plugin.json")}](${abs("/.well-known/ai-plugin.json")}).`);
  lines.push(`- [RSS feed](${abs("/feed.xml")}) · [JSON feed](${abs("/feed.json")}): new articles.`);
  lines.push("");

  // The curated nav groups, with descriptions. "Your collection", "Games" and
  // "Community & learn" are secondary → grouped under Optional at the end.
  const optionalTitles = new Set(["Your collection", "Games"]);
  const primary = NAV_GROUPS.filter((g) => !optionalTitles.has(g.title));
  const optional = NAV_GROUPS.filter((g) => optionalTitles.has(g.title));

  for (const g of primary) {
    lines.push(`## ${g.title}`);
    for (const l of g.links) {
      lines.push(`- [${l.label}](${abs(l.href)})${DESC[l.href] ? `: ${DESC[l.href]}` : ""}`);
    }
    lines.push("");
  }

  lines.push("## Optional");
  for (const g of optional) {
    for (const l of g.links) {
      lines.push(`- [${l.label}](${abs(l.href)})${DESC[l.href] ? `: ${DESC[l.href]}` : ""}`);
    }
  }
  lines.push(`- [Full text index](${abs("/llms-full.txt")}): a single-file markdown snapshot of the market and top cards.`);
  lines.push("");

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}

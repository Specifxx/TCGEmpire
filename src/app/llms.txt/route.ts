import { NAV_GROUPS } from "@/components/nav-groups";
import { SITE_URL } from "@/lib/site";

// llms.txt — the AI-agent site map (spec: llmstxt.org). A curated, markdown index
// of the site's most useful pages so LLMs/agents can navigate without parsing HTML.
// Served at /llms.txt. Mirrors the feed.xml route-handler pattern (plain-text GET).
export const revalidate = 86400;

// One-line descriptions for the hub pages (falls back to the nav label otherwise).
const DESC: Record<string, string> = {
  "/browse": "Every Riftbound card with live lowest prices compared across stores (AU/NZ/US/UK).",
  "/sealed": "Sealed products — booster boxes, packs and bundles — with the cheapest live price.",
  "/movers": "The biggest Riftbound price rises and falls, updated daily.",
  "/market": "The RiftCompare Index — a daily search-weighted market index for Riftbound singles, with key stats.",
  "/stores/tracked": "The stores whose public prices RiftCompare tracks and compares.",
  "/tools/arbitrage": "Deal Finder: cards worth more on eBay than in stores, plus the cheapest cards to buy on eBay.",
  "/tools/value-finder": "Finds undervalued cards trading below their fair market value.",
  "/tools/best-basket": "Cheapest single-store basket for a list of cards (minimises combined shipping).",
  "/tools/box-ev": "Booster-box expected value: the pull value of a sealed box vs its price.",
  "/decks": "Tournament meta decks, each costed live from current card prices.",
  "/deck": "Deck builder — assemble a deck and price it in real time.",
  "/trade": "Trade calculator — value two sides of a card trade fairly.",
  "/proxy": "Proxy printer for playtesting.",
  "/riftle": "Riftle — the daily Riftbound card guessing game.",
  "/games": "Free Riftbound mini-games (Riftle, pack sim, price games and more).",
  "/learn": "Learn Riftbound: an interactive new-player guide with real cards.",
  "/guides": "Buying guides and strategy articles for Riftbound.",
  "/blog": "News, metagame snapshots and the automated daily market report.",
  "/portfolio": "Track a collection's value over time.",
  "/wishlist": "Save cards and get price context.",
  "/premium": "RiftCompare Premium — the Deal Finder / value tools and ad-free browsing.",
  "/forum": "Community forum.",
};

const abs = (p: string) => `${SITE_URL}${p}`;

export function GET() {
  const lines: string[] = [];
  lines.push("# RiftCompare");
  lines.push("");
  lines.push(
    "> Free Riftbound: League of Legends TCG card database and live price comparison across " +
      "Australia, New Zealand, the United States and the United Kingdom. Home of the RiftCompare " +
      "Index (a daily market index for Riftbound singles), price movers, sealed products and buyer tools."
  );
  lines.push("");
  lines.push(
    "For AI agents: clean markdown versions of key pages live under `/llm/` — e.g. " +
      "`/llm/market`, `/llm/card/<id>` and `/llm/blog/<slug>` (also linked from each page as " +
      "`rel=alternate type=text/markdown`). Every page carries JSON-LD structured data, and the " +
      "RiftCompare Index is available as JSON (see Data)."
  );
  lines.push("");

  // Machine-readable data endpoints first — the highest-value surface for agents.
  lines.push("## Data (machine-readable)");
  lines.push(`- [RiftCompare Index (JSON)](${abs("/api/v1/index.json")}): the live index level, deltas, key stats and constituents.`);
  lines.push(`- [Market wrap archive](${abs("/market/wrap")}): every daily "what moved the market" report.`);
  lines.push(`- [RSS feed](${abs("/feed.xml")}) · [JSON feed](${abs("/feed.json")}): new articles and daily market reports.`);
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

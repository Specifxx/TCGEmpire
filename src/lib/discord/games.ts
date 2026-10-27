// The games the Discord price bot answers for (DECISIONS.md, "Discord price bot",
// 2026-10-27). One bot for the whole family: each game names the sister site that
// owns its prices, how the bot searches it, and the words eBay and TCGplayer need.
//
// Pure data and link builders: no database, no fetch, so the tests and the
// command-registration script import it freely.
import { COUNTRIES, type Country } from "../country";
import { TCGPLAYER_IMPACT_LINK, affiliateSubId, ebaySearchUrl } from "../affiliate";
import { RIFTBOUND_TCG_LINE, tcgplayerMassEntryUrl } from "../tcgplayer-cart";

export type GameKey = "riftbound" | "onepiece" | "pokemon" | "mtg" | "gundam" | "lorcana" | "yugioh";

/**
 * How the bot finds a card. `riftbound` reads RiftCompare's own cached catalogue,
 * `opcompare` and `engine` call that site's public /api/search, and `none` (the
 * sealed-only sites) answers with search links only.
 */
export type SearchKind = "riftbound" | "opcompare" | "engine" | "none";

export interface BotGame {
  key: GameKey;
  label: string;
  siteName: string;
  site: string;
  search: SearchKind;
  /** Word eBay needs so a search stays inside the game ("Luffy" alone finds figures). */
  ebayWord: string;
  /** TCGplayer's search path segment. */
  tcgSlug: string;
  /** TCGplayer's Mass Entry `productline`. */
  tcgLine: string;
  /** Markets the site prices in; the bot falls back to the US elsewhere. */
  markets: Country[];
}

const ALL: Country[] = ["US", "UK", "AU", "CA", "EU", "SG"];

export const BOT_GAMES: BotGame[] = [
  { key: "riftbound", label: "Riftbound", siteName: "RiftCompare", site: "https://riftcompare.com", search: "riftbound", ebayWord: "Riftbound", tcgSlug: "riftbound-league-of-legends-trading-card-game", tcgLine: RIFTBOUND_TCG_LINE, markets: ALL },
  { key: "onepiece", label: "One Piece", siteName: "OP Compare", site: "https://opcompare.app", search: "opcompare", ebayWord: "One Piece TCG", tcgSlug: "one-piece-card-game", tcgLine: "One Piece Card Game", markets: ALL },
  { key: "pokemon", label: "Pokémon (sealed)", siteName: "DexCompare", site: "https://www.dexcompare.app", search: "none", ebayWord: "Pokemon TCG", tcgSlug: "pokemon", tcgLine: "Pokemon", markets: ALL },
  { key: "mtg", label: "Magic (sealed)", siteName: "MTG Compare", site: "https://mtgcompare.app", search: "none", ebayWord: "MTG", tcgSlug: "magic", tcgLine: "Magic", markets: ALL },
  { key: "gundam", label: "Gundam", siteName: "Gundam Compare", site: "https://gundamcompare.com", search: "engine", ebayWord: "Gundam Card Game", tcgSlug: "gundam-card-game", tcgLine: "Gundam Card Game", markets: ["US"] },
  { key: "lorcana", label: "Lorcana", siteName: "Lorcana Compare", site: "https://lorcanacompare.com", search: "engine", ebayWord: "Lorcana", tcgSlug: "lorcana-tcg", tcgLine: "Lorcana TCG", markets: ["US"] },
  { key: "yugioh", label: "Yu-Gi-Oh!", siteName: "YGO Compare", site: "https://ygocompare.com", search: "engine", ebayWord: "Yugioh", tcgSlug: "yugioh", tcgLine: "YuGiOh", markets: ["US"] },
];

export function botGame(key: string | undefined | null): BotGame {
  return BOT_GAMES.find((g) => g.key === key) ?? BOT_GAMES[0];
}

export function botMarket(v: string | undefined | null): Country {
  const up = (v ?? "").toUpperCase();
  return up in COUNTRIES ? (up as Country) : "US";
}

/** Every outbound link carries `discord-<game>` so EPN and Impact report the bot apart from the sites. */
export const botSubId = (g: BotGame, what?: string) => affiliateSubId("discord", g.key, what);

/** Our own page for a hit, tagged so the sites' analytics can count the bot's visitors. */
export function siteLink(g: BotGame, path: string): string {
  const u = new URL(path, g.site);
  u.searchParams.set("utm_source", "discord");
  u.searchParams.set("utm_medium", "bot");
  return u.toString();
}

export function ebayLink(g: BotGame, market: Country, query: string): string {
  const q = new RegExp(`\\b${g.ebayWord.split(" ")[0]}\\b`, "i").test(query) ? query : `${g.ebayWord} ${query}`;
  return ebaySearchUrl(market, q.replace(/,/g, " ").replace(/\s+/g, " ").trim(), botSubId(g, "price"));
}

const impact = (url: string, sub: string) => `${TCGPLAYER_IMPACT_LINK}?u=${encodeURIComponent(url)}&sharedid=${encodeURIComponent(sub)}`;

export function tcgplayerSearchLink(g: BotGame, query: string): string {
  const url = `https://www.tcgplayer.com/search/${g.tcgSlug}/product?q=${encodeURIComponent(query)}`;
  return impact(url, botSubId(g, "price"));
}

export interface DeckLine {
  qty: number;
  name: string;
}

// "4 Luffy", "4x Luffy", "Luffy x4", "1 Sol Ring (CMR) 263": the formats deck
// builders export. Section headers ("Main Deck:", "// Sideboard") and blank lines
// are skipped; a line with no quantity counts once.
export function parseDeckList(text: string): DeckLine[] {
  const out = new Map<string, DeckLine>();
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.replace(/^\s*[-*•]\s*/, "").trim();
    if (!line || /^(\/\/|#)/.test(line) || /:\s*$/.test(line)) continue;
    let qty = 1;
    const lead = line.match(/^(\d{1,2})\s*[x×]?\s+(.+)$/i);
    const tail = line.match(/^(.+?)\s+[x×]\s*(\d{1,2})$/i);
    if (lead) [qty, line] = [Number(lead[1]), lead[2]];
    else if (tail) [qty, line] = [Number(tail[2]), tail[1]];
    // Set codes and collector numbers after the name confuse Mass Entry.
    const name = line.replace(/\s*\([^)]*\)\s*[\w-]*\s*$/, "").replace(/\s+/g, " ").trim();
    if (!name || qty < 1) continue;
    const key = name.toLowerCase();
    const prev = out.get(key);
    out.set(key, { qty: Math.min(99, (prev?.qty ?? 0) + qty), name });
  }
  return [...out.values()];
}

/** The whole list as one TCGplayer cart (lib/tcgplayer-cart.ts), through Impact. */
export function tcgplayerCartLink(g: BotGame, lines: DeckLine[]): string {
  return impact(tcgplayerMassEntryUrl(g.tcgLine, lines), botSubId(g, "deck"));
}

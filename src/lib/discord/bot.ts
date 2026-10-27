// The Discord price bot's commands and replies (DECISIONS.md, "Discord price bot",
// 2026-10-27). Slash commands only, answered over HTTP by
// /api/discord/interactions: no gateway connection, no database, no stored state.
//
//   /price game card [market]  the top three matches with prices, a link to the
//                              site's comparison and eBay + TCGplayer buttons
//   /deck game [market]        opens a box for a pasted list, then answers with a
//                              one-tap TCGplayer cart (Mass Entry)
//   /pricebot                  what it is, and that the links are paid
//
// EPN wants paid links disclosed at the START of a social post, so every public
// reply opens with "#ad". Links are plain affiliate links to eBay and TCGplayer
// (never a redirect through our domain to eBay, which EPN forbids) plus links to
// our own pages tagged utm_source=discord.
import { COUNTRIES, type Country } from "../country";
import { BOT_GAMES, botGame, botMarket, ebayLink, parseDeckList, siteLink, tcgplayerCartLink, tcgplayerSearchLink, type BotGame } from "./games";
import { lookupCards, type LookupDeps } from "./lookup";

// Discord's numeric enums, named.
const T = { PING: 1, COMMAND: 2, MODAL_SUBMIT: 5 } as const;
const R = { PONG: 1, MESSAGE: 4, MODAL: 9 } as const;
const EPHEMERAL = 64;
const LINK_BUTTON = 5;
const BUTTON_URL_MAX = 512;
const BRAND_COLOR = 0x2563eb;

export const AD_LINE = "-# #ad · Paid links: we may earn a commission when you buy on eBay or TCGplayer. Prices are the same for you.";

const MARKET_CHOICES = (["US", "UK", "AU", "CA", "EU", "SG"] as Country[]).map((c) => ({ name: COUNTRIES[c].label, value: c }));
const GAME_OPTION = { type: 3, name: "game", description: "Which game", required: true, choices: BOT_GAMES.map((g) => ({ name: g.label, value: g.key })) };
const MARKET_OPTION = { type: 3, name: "market", description: "Where you buy (default: United States)", required: false, choices: MARKET_CHOICES };
// Usable in servers, in DMs with the bot and, once a person installs it to
// their own account, in any server or DM they are in.
const EVERYWHERE = { integration_types: [0, 1], contexts: [0, 1, 2] };

/** What scripts/discord-register.ts sends to Discord. */
export const BOT_COMMANDS = [
  {
    name: "price",
    description: "Price check a card or sealed product: stores, eBay and TCGplayer",
    ...EVERYWHERE,
    options: [GAME_OPTION, { type: 3, name: "card", description: "Card or product name, e.g. Jinx or Luffy OP05", required: true, max_length: 80 }, MARKET_OPTION],
  },
  {
    name: "deck",
    description: "Paste a deck list and get a one-tap TCGplayer cart",
    ...EVERYWHERE,
    options: [GAME_OPTION, MARKET_OPTION],
  },
  { name: "pricebot", description: "What this bot does and how it is paid for", ...EVERYWHERE },
];

type Option = { name: string; value?: string | number };
export interface Interaction {
  type: number;
  data?: {
    name?: string;
    options?: Option[];
    custom_id?: string;
    components?: { components?: { custom_id?: string; value?: string }[] }[];
  };
}

const opt = (i: Interaction, name: string) => {
  const v = i.data?.options?.find((o) => o.name === name)?.value;
  return v == null ? undefined : String(v);
};

const button = (label: string, url: string) => ({ type: 2, style: LINK_BUTTON, label, url });
const row = (...buttons: ReturnType<typeof button>[]) => ({ type: 1, components: buttons.filter((b) => b.url.length <= BUTTON_URL_MAX).slice(0, 5) });
const message = (data: Record<string, unknown>) => ({ type: R.MESSAGE, data: { allowed_mentions: { parse: [] }, ...data } });
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function marketFor(g: BotGame, m: Country): Country {
  return g.markets.includes(m) ? m : "US";
}

export async function priceReply(g: BotGame, query: string, asked: Country, deps: LookupDeps) {
  const market = marketFor(g, asked);
  const hits = await lookupCards(g, query, market, deps);
  const note = market !== asked ? ` (${g.siteName} prices the US only)` : "";
  if (!hits.length) {
    return message({
      content: `${AD_LINE}\nNo ${g.label} match for **${clip(query, 80)}** right now. These searches may still find it:`,
      components: [row(button(`Open ${g.siteName}`, siteLink(g, "/")), button("Search eBay", ebayLink(g, market, query)), button("Search TCGplayer", tcgplayerSearchLink(g, query)))],
    });
  }
  const top = hits[0];
  return message({
    content: AD_LINE,
    embeds: hits.map((h, n) => ({
      title: clip(h.name, 250),
      url: siteLink(g, h.path),
      description: [h.detail, h.price ? `**${h.price}**` : "No live price yet"].filter(Boolean).join("\n"),
      color: BRAND_COLOR,
      ...(h.image && n === 0 ? { thumbnail: { url: h.image } } : {}),
      ...(n === hits.length - 1 ? { footer: { text: `${g.siteName} · ${COUNTRIES[market].label}${note}` } } : {}),
    })),
    components: [
      row(
        button("Compare every store", siteLink(g, top.path)),
        button(`eBay${market === "US" ? "" : ` ${market}`}`, ebayLink(g, market, top.name)),
        button("TCGplayer", tcgplayerSearchLink(g, top.name)),
      ),
    ],
  });
}

export function deckModal(g: BotGame, market: Country) {
  return {
    type: R.MODAL,
    data: {
      custom_id: `deck:${g.key}:${market}`,
      title: clip(`Buy a ${g.label} deck`, 45),
      components: [
        {
          type: 1,
          components: [{ type: 4, custom_id: "list", style: 2, label: "Deck list (one card per line)", placeholder: "4 Card name\n4 Another card\n2 Third card", min_length: 3, max_length: 4000, required: true }],
        },
      ],
    },
  };
}

export function deckReply(g: BotGame, market: Country, text: string) {
  const lines = parseDeckList(text);
  if (!lines.length) {
    return message({ content: "I couldn't read that list. Put one card per line, like `4 Card name`.", flags: EPHEMERAL });
  }
  const cards = lines.reduce((n, l) => n + l.qty, 0);
  const cart = tcgplayerCartLink(g, lines);
  const preview = lines.slice(0, 12).map((l) => `${l.qty} ${clip(l.name, 40)}`).join("\n");
  return message({
    content: AD_LINE,
    embeds: [
      {
        title: `${g.label} deck: ${cards} cards, ${lines.length} different`,
        description: `**[Buy the whole list on TCGplayer →](${cart})**\nOne tap fills your cart; remove what you already own.\n\`\`\`\n${preview}${lines.length > 12 ? `\n…and ${lines.length - 12} more` : ""}\n\`\`\``,
        color: BRAND_COLOR,
        footer: { text: `Compare store prices card by card on ${g.siteName} · ${COUNTRIES[market].label}` },
      },
    ],
    components: [row(button("TCGplayer cart", cart), button(`Compare on ${g.siteName}`, siteLink(g, "/")))],
  });
}

export function helpReply() {
  return message({
    flags: EPHEMERAL,
    content: [
      "**Compare Empire price bot**",
      "`/price` finds a card or sealed product and shows its price, with links to compare every store, eBay and TCGplayer.",
      "`/deck` takes a pasted deck list and gives you a one-tap TCGplayer cart.",
      `Games: ${BOT_GAMES.map((g) => g.label).join(", ")}.`,
      "Prices come from RiftCompare and its sister sites. The eBay and TCGplayer links are paid links: we may earn a commission, and the price is the same for you.",
    ].join("\n"),
  });
}

/** The whole interaction, minus the signature check (the route does that first). */
export async function handleInteraction(i: Interaction, deps: LookupDeps): Promise<Record<string, unknown>> {
  if (i.type === T.PING) return { type: R.PONG };
  if (i.type === T.COMMAND) {
    const g = botGame(opt(i, "game"));
    const market = botMarket(opt(i, "market"));
    if (i.data?.name === "price") return priceReply(g, opt(i, "card") ?? "", market, deps);
    if (i.data?.name === "deck") return deckModal(g, marketFor(g, market));
    return helpReply();
  }
  if (i.type === T.MODAL_SUBMIT && i.data?.custom_id?.startsWith("deck:")) {
    const [, game, market] = i.data.custom_id.split(":");
    const text = i.data.components?.flatMap((r) => r.components ?? []).find((c) => c.custom_id === "list")?.value ?? "";
    return deckReply(botGame(game), botMarket(market), text);
  }
  return message({ content: "That isn't something I can answer yet. Try `/price` or `/deck`.", flags: EPHEMERAL });
}

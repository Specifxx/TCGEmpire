// The Pokémon Discord app: request verification, the slash commands, and every
// reply it can send. Pure apart from node:crypto (the signature check), so the
// whole conversation can be tested from the fixtures without a database or a
// Discord account (tests/pokemon-discord.test.ts). The route
// (app/api/pokemon/discord/route.ts) is the only thing that reads data.
//
// A SEPARATE app from the Riftbound bot (app/api/discord/interactions), so the
// section stays removable and neither bot's commands leak into the other's.
//
// WHAT A REPLY MAY CARRY, and why. Collectors use it where links are banned, so:
//   - exactly one link, in embed.url, to our own page through pokemonUtm
//     (utm_source=discord-bot, a pkmn-… campaign): installs and arrivals are
//     measured from that, never from logs;
//   - no affiliate or marketplace URL anywhere, and no thumbnail: a
//     tcgplayer-cdn image URL is a marketplace host too;
//   - allowed_mentions parse nothing, so a product name can never ping a room.
// The figures follow the site's rules unchanged (lib/pokemon/board.ts): listings
// cheapest first with eBay in its price position, references below them and ≈
// when converted, "TCGplayer lists" for every date, and an "as of" date on every
// reply, because Discord keeps a message long after the import moves on.

import { createPublicKey, verify as edVerify } from "node:crypto";
import { COUNTRIES, type Country } from "../country";
import { formatMoney } from "../format";
import { offerStock } from "../sealed-offers";
import { buildBoard, listingLabel } from "./board";
import { formatDay } from "./format";
import { foldName, kindInfo, kindOrder, type PkKind } from "./kinds";
import { perPackCents } from "./packs";
import { PER_PACK_KINDS, asOfLabel, cheapestByKind, formatPerPack, isHalfBox, perPackRanking, pokemonUtm } from "./value";
import type { PkCatalog, PkProductDetail, PkSetSummary, PkTile } from "./types";

// ── Verification ─────────────────────────────────────────────────────────────

// Discord signs timestamp + raw body with the app's Ed25519 key. Node verifies
// a raw 32-byte Ed25519 key once it is wrapped in this SPKI DER header (the
// same approach as the Riftbound bot, copied rather than imported so this
// section never depends on a Riftbound route).
const ED25519_SPKI_PREFIX = "302a300506032b6570032100";

/** True only for a well-formed signature by `publicKeyHex` over timestamp + rawBody. */
export function verifyDiscordRequest(rawBody: string, sigHex: string, timestamp: string, publicKeyHex: string): boolean {
  // Buffer.from(hex) silently drops a bad tail, so malformed input is refused
  // before it can be half-read into a key or a signature.
  if (!/^[0-9a-f]{64}$/i.test(publicKeyHex ?? "")) return false;
  if (!/^[0-9a-f]{128}$/i.test(sigHex ?? "")) return false;
  if (!timestamp) return false;
  try {
    const key = createPublicKey({
      key: Buffer.concat([Buffer.from(ED25519_SPKI_PREFIX, "hex"), Buffer.from(publicKeyHex, "hex")]),
      format: "der",
      type: "spki",
    });
    return edVerify(null, Buffer.from(timestamp + rawBody), key, Buffer.from(sigHex, "hex"));
  } catch {
    return false;
  }
}

// ── Interaction shapes ───────────────────────────────────────────────────────

export const INTERACTION = { PING: 1, COMMAND: 2, AUTOCOMPLETE: 4 } as const;
export const RESPONSE = { PONG: 1, MESSAGE: 4, AUTOCOMPLETE_RESULT: 8 } as const;
/** Message flag: only the person who ran the command sees it. */
export const EPHEMERAL = 64;

export interface DiscordOption {
  name: string;
  type?: number;
  value?: string | number | boolean;
  focused?: boolean;
  options?: DiscordOption[];
}

export interface DiscordInteraction {
  type: number;
  data?: { name?: string; options?: DiscordOption[] };
  /** 0 server, 1 a DM with the app, 2 any other DM or group DM. */
  context?: number;
}

export function optionValue(i: DiscordInteraction, name: string): string | null {
  const o = i.data?.options?.find((x) => x.name === name);
  return o?.value == null ? null : String(o.value);
}

export function focusedOption(i: DiscordInteraction): { name: string; value: string } | null {
  const o = i.data?.options?.find((x) => x.focused);
  return o ? { name: o.name, value: o.value == null ? "" : String(o.value) } : null;
}

/** Where a command ran, in words the privacy notice uses. Never an id. */
export function interactionContext(i: DiscordInteraction): "server" | "app-dm" | "dm-or-group" | "unknown" {
  if (i.context === 0) return "server";
  if (i.context === 1) return "app-dm";
  if (i.context === 2) return "dm-or-group";
  return "unknown";
}

// ── Commands ─────────────────────────────────────────────────────────────────

/** The markets a command can ask for, US first: the default, as on the site. */
export const BOT_MARKETS: readonly Country[] = ["US", "UK", "EU", "AU", "CA", "SG"];

export function parseMarket(v: string | null | undefined): Country {
  return BOT_MARKETS.includes(v as Country) ? (v as Country) : "US";
}

/** /perpack's choices. "etb" means both ETB kinds, as on the Elite Trainer Box hub. */
export const PERPACK_KINDS = {
  "booster-box": { label: "Booster boxes", kinds: ["booster-box"] },
  etb: { label: "Elite Trainer Boxes", kinds: ["etb", "pc-etb"] },
  "booster-bundle": { label: "Booster bundles", kinds: ["booster-bundle"] },
} as const satisfies Record<string, { label: string; kinds: readonly PkKind[] }>;
export type PerPackChoice = keyof typeof PERPACK_KINDS;

export function parsePerPackKind(v: string | null | undefined): PerPackChoice | null {
  return v != null && Object.prototype.hasOwnProperty.call(PERPACK_KINDS, v) ? (v as PerPackChoice) : null;
}

const STRING = 3;
const CHAT_INPUT = 1;

const MARKET_OPTION = {
  type: STRING,
  name: "market",
  description: "Which market's prices (United States if left out)",
  required: false,
  choices: BOT_MARKETS.map((m) => ({ name: COUNTRIES[m].label, value: m })),
};

// integration_types [0, 1]: a server can add it, and so can a collector to
// their own account (usable wherever a server allows external apps).
// contexts [0, 1, 2]: servers, the app's own DM, and other DMs and group DMs.
const EVERYWHERE = { integration_types: [0, 1], contexts: [0, 1, 2] };

export const COMMANDS = [
  {
    name: "sealed",
    type: CHAT_INPUT,
    description: "Cheapest listings we track for one sealed Pokémon product",
    ...EVERYWHERE,
    options: [
      { type: STRING, name: "product", description: "Start typing a product name", required: true, autocomplete: true, max_length: 100 },
      MARKET_OPTION,
    ],
  },
  {
    name: "perpack",
    type: CHAT_INPUT,
    description: "Lowest price per booster pack among one product type",
    ...EVERYWHERE,
    options: [
      {
        type: STRING,
        name: "kind",
        description: "Product type",
        required: true,
        choices: (Object.keys(PERPACK_KINDS) as PerPackChoice[]).map((k) => ({ name: PERPACK_KINDS[k].label, value: k })),
      },
      MARKET_OPTION,
    ],
  },
  {
    name: "set",
    type: CHAT_INPUT,
    description: "Cheapest sealed product of each type in one Pokémon set",
    ...EVERYWHERE,
    options: [
      { type: STRING, name: "name", description: "Start typing a set name", required: true, autocomplete: true, max_length: 100 },
      MARKET_OPTION,
    ],
  },
];

// ── Autocomplete and resolution ──────────────────────────────────────────────

/** Discord's limits on an autocomplete answer. */
export const MAX_CHOICES = 25;
export const MAX_CHOICE_NAME = 100;

const clamp = (s: string, n: number): string => (s.length <= n ? s : `${s.slice(0, n - 1)}…`);
const tokens = (s: string): string[] =>
  foldName(s)
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

// What people type that a TCGplayer title never says.
const KIND_ALIASES: Partial<Record<PkKind, string>> = {
  etb: "etb",
  "pc-etb": "etb pc pokemon center",
  "booster-box": "box display",
  upc: "upc",
  spc: "spc",
};

function productWords(t: PkTile): string[] {
  return tokens(`${t.name} ${KIND_ALIASES[t.kind] ?? ""}`);
}

/** Every typed word is the start of some word of the item. */
const covers = (typed: readonly string[], words: readonly string[]) => typed.every((q) => words.some((w) => w.startsWith(q)));

// Closest first: the fewest words beyond what was typed (every candidate
// already covers the typed words, so the shortest has the fewest extra ones and
// "booster box" finds the box before the half box), then the newest release,
// then the name.
function rankProducts(list: readonly PkTile[]): PkTile[] {
  return list
    .map((t) => ({ t, extra: productWords(t).length }))
    .sort((a, b) => a.extra - b.extra || (b.t.releasedOn ?? "").localeCompare(a.t.releasedOn ?? "") || a.t.name.localeCompare(b.t.name))
    .map((x) => x.t);
}

function productChoice(t: PkTile): { name: string; value: string } {
  return { name: clamp(t.presale ? `${t.name} (pre-order)` : t.name, MAX_CHOICE_NAME), value: t.slug };
}

/** Suggestions as someone types into /sealed. Value is always a real slug. */
export function autocompleteProducts(catalog: Pick<PkCatalog, "tiles">, query: string): { name: string; value: string }[] {
  const typed = tokens(query ?? "").slice(0, 8);
  if (!typed.length) {
    // Nothing typed yet: the hub kinds, newest first, which is what most people want.
    const hub = new Set<string>(PER_PACK_KINDS);
    return [...catalog.tiles]
      .filter((t) => hub.has(t.kind) && !isHalfBox(t))
      .sort((a, b) => (b.releasedOn ?? "").localeCompare(a.releasedOn ?? "") || kindOrder(a.kind) - kindOrder(b.kind) || a.name.localeCompare(b.name))
      .slice(0, MAX_CHOICES)
      .map(productChoice);
  }
  return rankProducts(catalog.tiles.filter((t) => covers(typed, productWords(t))))
    .slice(0, MAX_CHOICES)
    .map(productChoice);
}

/** Suggestions as someone types into /set. */
export function autocompleteSets(catalog: Pick<PkCatalog, "sets">, query: string): { name: string; value: string }[] {
  const typed = tokens(query ?? "").slice(0, 8);
  const sets = typed.length ? catalog.sets.filter((s) => covers(typed, tokens(`${s.name} ${s.code ?? ""}`))) : catalog.sets;
  return [...sets]
    .sort((a, b) => (b.releasedOn ?? "").localeCompare(a.releasedOn ?? "") || a.name.localeCompare(b.name))
    .slice(0, MAX_CHOICES)
    .map((s) => ({ name: clamp(s.code ? `${s.name} (${s.code})` : s.name, MAX_CHOICE_NAME), value: s.slug }));
}

/**
 * The product a /sealed value means: an exact slug (a picked suggestion), else
 * the closest name match, else null. Whatever someone types freehand is only
 * ever compared against the catalogue here; only a slug this returns reaches
 * getPokemonProduct, so an invented string costs no read and no cache entry.
 */
export function resolveProduct(catalog: Pick<PkCatalog, "tiles">, value: string | null | undefined): PkTile | null {
  const v = (value ?? "").trim().slice(0, 200);
  if (!v) return null;
  const bySlug = catalog.tiles.find((t) => t.slug === v);
  if (bySlug) return bySlug;
  const folded = foldName(v).replace(/\s+/g, " ");
  const byName = catalog.tiles.find((t) => foldName(t.name) === folded);
  if (byName) return byName;
  const typed = tokens(v).slice(0, 12);
  if (typed.join("").length < 2) return null;
  return rankProducts(catalog.tiles.filter((t) => covers(typed, productWords(t))))[0] ?? null;
}

/** The set a /set value means: slug, else name or code, else the closest name. */
export function resolveSet(catalog: Pick<PkCatalog, "sets">, value: string | null | undefined): PkSetSummary | null {
  const v = (value ?? "").trim().slice(0, 200);
  if (!v) return null;
  const bySlug = catalog.sets.find((s) => s.slug === v);
  if (bySlug) return bySlug;
  const folded = foldName(v).replace(/\s+/g, " ");
  const exact = catalog.sets.find((s) => foldName(s.name) === folded || (s.code != null && foldName(s.code) === folded));
  if (exact) return exact;
  const typed = tokens(v).slice(0, 12);
  if (typed.join("").length < 2) return null;
  return (
    [...catalog.sets]
      .filter((s) => covers(typed, tokens(s.name)))
      .sort((a, b) => tokens(a.name).length - tokens(b.name).length || (b.releasedOn ?? "").localeCompare(a.releasedOn ?? ""))[0] ?? null
  );
}

// ── Replies ──────────────────────────────────────────────────────────────────

/** Discord's embed limits. */
export const EMBED_LIMITS = { title: 256, description: 4096, fields: 25, fieldValue: 1024, footer: 2048 } as const;

/** Pokéball red, as on the section's share card. */
const EMBED_COLOR = 0xe5484d;
const NO_MENTIONS = { parse: [] as string[] };

export interface DiscordEmbed {
  title: string;
  url: string;
  color: number;
  description: string;
  footer: { text: string };
}

export interface DiscordReply {
  type: typeof RESPONSE.MESSAGE;
  data: { embeds?: DiscordEmbed[]; content?: string; flags?: number; allowed_mentions: { parse: string[] } };
}

function footer(asOf: string | null): { text: string } {
  return { text: clamp(["Item price, postage extra", "updated daily", asOf].filter(Boolean).join(" · "), EMBED_LIMITS.footer) };
}

function embedReply(title: string, url: string, lines: string[], asOf: string | null): DiscordReply {
  return {
    type: RESPONSE.MESSAGE,
    data: {
      embeds: [
        {
          title: clamp(title, EMBED_LIMITS.title),
          url,
          color: EMBED_COLOR,
          description: clamp(lines.join("\n").trim(), EMBED_LIMITS.description),
          footer: footer(asOf),
        },
      ],
      allowed_mentions: NO_MENTIONS,
    },
  };
}

const utm = (path: string, campaign: `pkmn-${string}`) => pokemonUtm(path, { source: "discord-bot", medium: "bot", campaign });

const releaseLine = (day: string | null, presale: boolean): string | null => {
  const d = formatDay(day);
  if (!d) return null;
  return presale ? `Pre-order: TCGplayer lists ${d}` : `Release: TCGplayer lists ${d}`;
};

const packs = (n: number) => `${n} ${n === 1 ? "pack" : "packs"}`;

const newest = (isos: readonly string[]): string | null => (isos.length ? isos.reduce((a, b) => (b > a ? b : a)) : null);

/** /sealed: one product's listings in one market, cheapest first, references below. */
export function sealedReply(detail: PkProductDetail, market: Country, now: number = Date.now()): DiscordReply {
  const path = `/pokemon/sealed/${detail.slug}`;
  // The board's hrefs are built and then never used: nothing below reads them.
  const board = buildBoard(detail.name, detail.offers, market, { page: path, surface: "discord", now });
  const place = COUNTRIES[market].place;
  const lines: string[] = [];

  lines.push([kindInfo(detail.kind).label, detail.set?.name].filter(Boolean).join(" · "));
  lines.push("");
  lines.push(`**Cheapest listings in ${place}**`);
  if (!board.listings.length) lines.push(`No tracked listings in ${place}.`);
  board.listings.forEach((l, i) => {
    const state = offerStock(l, now);
    const bits = [`**${formatMoney(l.priceCents, l.currency)}**`, l.label];
    if (l.source === "ebay") {
      bits.push(l.shippingCents == null ? "+ postage" : l.shippingCents === 0 ? "free postage" : `+ ${formatMoney(l.shippingCents, l.currency)} postage`);
    }
    if (state === "soldout") bits.push("sold out");
    if (state === "unknown") bits.push("stock unknown");
    lines.push(`${i + 1}. ${bits.join(" · ")}`);
  });
  const pp = board.headline ? perPackCents(board.headline.priceCents, detail.packCount) : null;
  if (pp != null && detail.packCount) lines.push(`${formatPerPack(pp, board.currency)} at the cheapest listing (${packs(detail.packCount)})`);

  if (board.references.length) {
    lines.push("");
    lines.push("**Reference prices**, not listings");
    for (const r of board.references) {
      lines.push(`${r.label}: ${r.converted ? "≈ " : ""}${formatMoney(r.priceCents, r.currency)}${r.converted ? " (converted)" : ""}`);
    }
  }

  const release = releaseLine(detail.releasedOn, detail.presale);
  if (release) {
    lines.push("");
    lines.push(release);
  }

  const asOf = asOfLabel(newest([...board.listings.map((l) => l.lastSeen), ...board.references.map((r) => r.checkedAt)]));
  return embedReply(detail.name, utm(path, "pkmn-sealed"), lines, asOf);
}

/** Rows a /perpack answer lists. */
export const PERPACK_ROWS = 10;

/** /perpack: the lowest price per pack among one product type, in one market. */
export function perPackReply(catalog: PkCatalog, kind: PerPackChoice): DiscordReply {
  const { label, kinds } = PERPACK_KINDS[kind];
  const place = COUNTRIES[catalog.market].place;
  const ranked = perPackRanking(catalog.tiles, { kinds, limit: PERPACK_ROWS });
  const lines: string[] = [`The cheapest listing in ${place} divided by the booster packs inside. Pre-orders are left out.`, ""];
  if (!ranked.length) lines.push(`No tracked listings in ${place} with a known pack count.`);
  ranked.forEach((t, i) => {
    const where = t.lowSource ? ` on ${listingLabel(t.lowSource, catalog.market)}` : "";
    lines.push(
      `${i + 1}. **${formatPerPack(t.perPackCents as number, catalog.currency)}** · ${t.name} · ${formatMoney(t.lowCents as number, catalog.currency)}${where}, ${packs(t.packCount as number)}`,
    );
  });
  return embedReply(`Lowest price per pack: ${label}`, utm(`/pokemon/price-per-pack#${kind}`, "pkmn-perpack"), lines, asOfLabel(catalog.pricesAsOf));
}

/** Kinds a /set answer can list, at most. */
export const SET_ROWS = 8;

/** /set: the cheapest product of each type in one set, in one market. */
export function setReply(catalog: PkCatalog, slug: string): DiscordReply {
  const set = catalog.sets.find((s) => s.slug === slug);
  if (!set) return fallbackReply("not found");
  const tiles = catalog.tiles.filter((t) => t.setSlug === set.slug);
  const place = COUNTRIES[catalog.market].place;
  const presale = tiles.some((t) => t.presale);
  const lines: string[] = [`${set.productCount} sealed ${set.productCount === 1 ? "product" : "products"} · ${set.series}`];
  const date = formatDay(set.releasedOn);
  if (date) lines.push(presale ? `Pre-orders open: TCGplayer lists ${date}` : `Release: TCGplayer lists ${date}`);
  lines.push("");
  lines.push(`**Cheapest listing of each type in ${place}**`);

  const cheapest = Object.values(cheapestByKind(tiles, { includePresale: true }))
    .filter((t): t is PkTile => t != null)
    .sort((a, b) => kindOrder(a.kind) - kindOrder(b.kind))
    .slice(0, SET_ROWS);
  for (const t of cheapest) {
    const bits = [`${kindInfo(t.kind).label}: **${formatMoney(t.lowCents as number, catalog.currency)}**`];
    if (t.lowSource) bits.push(listingLabel(t.lowSource, catalog.market));
    if (t.presale) bits.push("pre-order");
    if (t.perPackCents != null) bits.push(formatPerPack(t.perPackCents, catalog.currency));
    lines.push(`${bits.join(" · ")} (${t.name})`);
  }

  if (!cheapest.length) {
    lines.push(`No tracked listings in ${place}.`);
    // The reference only, as on the site: TCGplayer's US market price, converted outside the US.
    const refs = PER_PACK_KINDS.map((k) =>
      tiles
        .filter((t) => t.kind === k && t.refCents != null && !isHalfBox(t))
        .sort((a, b) => (a.refCents as number) - (b.refCents as number))[0],
    ).filter((t): t is PkTile => t != null);
    if (refs.length) {
      const converted = catalog.market !== "US";
      lines.push("");
      lines.push(`**TCGplayer market price**, a reference, not a listing${converted ? " (converted)" : ""}`);
      for (const t of refs) {
        lines.push(`${kindInfo(t.kind).label}: ${converted ? "≈ " : ""}${formatMoney(t.refCents as number, catalog.currency)} (${t.name})`);
      }
    }
  }
  return embedReply(`${set.name} sealed prices`, utm(`/pokemon/sets/${set.slug}`, "pkmn-set"), lines, asOfLabel(catalog.pricesAsOf));
}

const FALLBACK = {
  "not found": "Nothing we price matches that. Start typing, then pick a product or set from the list.",
  timeout: "Prices took too long to load. Try again in a moment.",
  error: "Prices could not be read just now. Try again in a moment.",
  unknown: "That command is not one this app knows.",
} as const;

/** A short note only the person who ran the command sees. No embed, no link. */
export function fallbackReply(reason: keyof typeof FALLBACK): DiscordReply {
  return { type: RESPONSE.MESSAGE, data: { content: FALLBACK[reason], flags: EPHEMERAL, allowed_mentions: NO_MENTIONS } };
}

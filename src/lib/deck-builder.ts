// THE VISUAL DECK BUILDER'S RULES (2026-10-21, owner: "make a deck builder
// feature … very, very visual … drag, click, hover … recommendations … the
// restrictions … side deck … save it for later … share code … 6 digits").
// DECISIONS.md, "A visual deck builder".
//
// Pure and dependency-free, so the client builder, the share API and the tests
// all run the same rules. The deck shape is the one /guides/how-a-riftbound-
// deck-is-built publishes (Riftbound's tournament rules, July 2026 update):
//   Legend 1 · Champion 1 · main deck 40 (the Champion counts toward it)
//   Runes 12 · Battlefields 3 (all different) · Side deck up to 10
//   At most 3 copies of a card, main deck + Champion + side deck COMBINED.
// Domains: our card data gives a Legend ONE domain, not the pair it allows, so
// the builder cannot enforce the exact pair. It warns instead when the deck's
// cards span more than two domains, or leave out the Legend's own.

export type Zone = "legend" | "champion" | "main" | "runes" | "battlefields" | "side";

export const ZONES: Zone[] = ["legend", "champion", "main", "runes", "battlefields", "side"];

export const ZONE_LABEL: Record<Zone, string> = {
  legend: "Legend",
  champion: "Champion",
  main: "Main deck",
  runes: "Runes",
  battlefields: "Battlefields",
  side: "Side deck",
};

/** Required (exact) or maximum size of each zone. */
export const ZONE_SIZE: Record<Zone, { exact?: number; max?: number }> = {
  legend: { exact: 1 },
  champion: { exact: 1 },
  main: { exact: 39 }, // + the Champion = 40
  runes: { exact: 12 },
  battlefields: { exact: 3 },
  side: { max: 10 },
};

export const MAIN_DECK_TOTAL = 40;
export const COPY_LIMIT = 3;
export const SIDE_MAX = 10;
export const MAX_DOMAINS = 2;
/** Riftbound's opening hand. */
export const OPENING_HAND = 4;

/** A card as the builder's catalog carries it (one entry per card name). */
export interface BuilderCard {
  id: string;
  slug: string | null;
  name: string;
  type: string; // Unit | Spell | Gear | Legend | Rune | Battlefield
  domain: string | null;
  energyCost: number | null;
  might: number | null;
  rarity: string;
  setCode: string;
  collectorNumber: string;
  img: string | null; // thumbnail
  full: string | null; // full-size art for the preview
  /** Cheapest printing of this name per market, cents (null = not in stock). */
  price: Partial<Record<"AU" | "US" | "UK" | "SG" | "CA" | "EU", number | null>>;
  /** Popularity on RiftCompare (views + searches), for recommendations. */
  pop: number;
}

export type DeckZones = Record<Zone, Record<string, number>>; // zone -> cardId -> qty

export function emptyDeck(): DeckZones {
  return { legend: {}, champion: {}, main: {}, runes: {}, battlefields: {}, side: {} };
}

export function zoneCount(d: DeckZones, z: Zone): number {
  return Object.values(d[z]).reduce((n, q) => n + q, 0);
}

/** "Master Yi, Wuju Master" -> "master yi": what ties a Legend to its Champion units. */
export function championKey(name: string): string {
  return name.split(",")[0].trim().toLowerCase();
}

/** Which zone a card goes to when it is simply clicked. */
export function defaultZone(card: Pick<BuilderCard, "type" | "name">, deck: DeckZones, byId: Map<string, BuilderCard>): Zone {
  if (card.type === "Legend") return "legend";
  if (card.type === "Rune") return "runes";
  if (card.type === "Battlefield") return "battlefields";
  // A unit of the Legend's champion becomes the Champion when that slot is empty.
  if (card.type === "Unit" && zoneCount(deck, "champion") === 0) {
    const legendId = Object.keys(deck.legend)[0];
    const legend = legendId ? byId.get(legendId) : undefined;
    if (legend && championKey(legend.name) === championKey(card.name)) return "champion";
  }
  return "main";
}

/** Can this card type live in this zone at all? */
export function zoneAccepts(z: Zone, card: Pick<BuilderCard, "type">): boolean {
  switch (z) {
    case "legend":
      return card.type === "Legend";
    case "champion":
      return card.type === "Unit";
    case "runes":
      return card.type === "Rune";
    case "battlefields":
      return card.type === "Battlefield";
    case "main":
    case "side":
      return card.type === "Unit" || card.type === "Spell" || card.type === "Gear";
  }
}

/** Copies of a card NAME in the zones the 3-copy limit covers. */
export function copiesOf(name: string, deck: DeckZones, byId: Map<string, BuilderCard>): number {
  let n = 0;
  for (const z of ["main", "champion", "side"] as Zone[]) {
    for (const [id, q] of Object.entries(deck[z])) if (byId.get(id)?.name === name) n += q;
  }
  return n;
}

export interface AddResult {
  deck: DeckZones;
  /** Why nothing changed, when nothing did. */
  refused?: string;
}

/** Add one copy, enforcing every hard limit; returns the new deck or why it refused. */
export function addCard(deck: DeckZones, card: BuilderCard, zone: Zone, byId: Map<string, BuilderCard>): AddResult {
  if (!zoneAccepts(zone, card)) return { deck, refused: `${card.type} cards can't go in the ${ZONE_LABEL[zone].toLowerCase()}` };
  const next: DeckZones = { ...deck, [zone]: { ...deck[zone] } } as DeckZones;
  if (zone === "legend" || zone === "champion") {
    next[zone] = { [card.id]: 1 }; // replaces
    if (zone === "legend" && Object.keys(deck.legend)[0] !== card.id) {
      // A new Legend: a Champion of another champion no longer fits, so it moves to the main deck.
      const champId = Object.keys(deck.champion)[0];
      const champ = champId ? byId.get(champId) : undefined;
      if (champ && championKey(champ.name) !== championKey(card.name)) {
        next.champion = {};
        next.main = { ...next.main, [champ.id]: (next.main[champ.id] ?? 0) + 1 };
      }
    }
    if (zone === "champion" && copiesOf(card.name, next, byId) > COPY_LIMIT) {
      return { deck, refused: `You already have ${COPY_LIMIT} copies of ${card.name}` };
    }
    return { deck: next };
  }
  if (zone === "battlefields") {
    if (deck.battlefields[card.id]) return { deck, refused: "Each Battlefield can only be in a deck once" };
    if (zoneCount(deck, "battlefields") >= 3) return { deck, refused: "A deck has exactly 3 Battlefields" };
  }
  if (zone === "runes" && zoneCount(deck, "runes") >= 12) return { deck, refused: "A deck has exactly 12 Runes" };
  if (zone === "main" && zoneCount(deck, "main") >= ZONE_SIZE.main.exact!) {
    return { deck, refused: `The main deck is full (${MAIN_DECK_TOTAL} with the Champion)` };
  }
  if (zone === "side" && zoneCount(deck, "side") >= SIDE_MAX) return { deck, refused: `The side deck holds up to ${SIDE_MAX}` };
  if ((zone === "main" || zone === "side") && copiesOf(card.name, deck, byId) >= COPY_LIMIT) {
    return { deck, refused: `${COPY_LIMIT} copies is the limit (main + side deck together)` };
  }
  next[zone][card.id] = (next[zone][card.id] ?? 0) + 1;
  return { deck: next };
}

export function removeCard(deck: DeckZones, cardId: string, zone: Zone): DeckZones {
  const q = deck[zone][cardId];
  if (!q) return deck;
  const z = { ...deck[zone] };
  if (q <= 1) delete z[cardId];
  else z[cardId] = q - 1;
  return { ...deck, [zone]: z } as DeckZones;
}

/** Move one copy between zones (drag and drop), under the same limits as adding. */
export function moveCard(deck: DeckZones, card: BuilderCard, from: Zone, to: Zone, byId: Map<string, BuilderCard>): AddResult {
  if (from === to) return { deck };
  const without = removeCard(deck, card.id, from);
  const r = addCard(without, card, to, byId);
  return r.refused ? { deck, refused: r.refused } : r;
}

export interface Issue {
  level: "error" | "warn";
  text: string;
}

/** Everything that keeps a deck from being tournament-legal, and the softer warnings. */
export function validateDeck(deck: DeckZones, byId: Map<string, BuilderCard>): Issue[] {
  const out: Issue[] = [];
  const legendId = Object.keys(deck.legend)[0];
  const legend = legendId ? byId.get(legendId) : undefined;
  if (!legend) out.push({ level: "error", text: "Choose a Legend" });
  const champId = Object.keys(deck.champion)[0];
  const champ = champId ? byId.get(champId) : undefined;
  if (!champ) out.push({ level: "error", text: "Choose a Champion unit" });
  else if (legend && championKey(champ.name) !== championKey(legend.name)) {
    out.push({ level: "error", text: `Your Champion must be a ${legend.name.split(",")[0]} unit` });
  }
  const main = zoneCount(deck, "main") + zoneCount(deck, "champion");
  if (main !== MAIN_DECK_TOTAL) out.push({ level: "error", text: `Main deck: ${main}/${MAIN_DECK_TOTAL} cards (Champion included)` });
  const runes = zoneCount(deck, "runes");
  if (runes !== 12) out.push({ level: "error", text: `Runes: ${runes}/12` });
  const bf = zoneCount(deck, "battlefields");
  if (bf !== 3) out.push({ level: "error", text: `Battlefields: ${bf}/3` });
  const side = zoneCount(deck, "side");
  if (side > SIDE_MAX) out.push({ level: "error", text: `Side deck: ${side}/${SIDE_MAX}` });

  const names = new Map<string, number>();
  for (const z of ["main", "champion", "side"] as Zone[]) {
    for (const [id, q] of Object.entries(deck[z])) {
      const c = byId.get(id);
      if (c) names.set(c.name, (names.get(c.name) ?? 0) + q);
    }
  }
  for (const [name, n] of names) if (n > COPY_LIMIT) out.push({ level: "error", text: `${name}: ${n} copies (limit ${COPY_LIMIT}, main + side)` });

  const doms = deckDomains(deck, byId);
  if (doms.length > MAX_DOMAINS) out.push({ level: "warn", text: `Your cards span ${doms.length} domains (${doms.join(", ")}). Legends allow two.` });
  if (legend?.domain && legend.domain !== "Colorless" && doms.length > 0 && !doms.includes(legend.domain)) {
    out.push({ level: "warn", text: `No ${legend.domain} cards, your Legend's domain` });
  }
  const runeDoms = new Set(Object.keys(deck.runes).map((id) => byId.get(id)?.domain).filter(Boolean) as string[]);
  for (const d of runeDoms) if (doms.length && !doms.includes(d)) out.push({ level: "warn", text: `${d} Runes, but no ${d} cards to cast` });
  return out;
}

/** The deck's domains (Colorless excluded), most-played first. */
export function deckDomains(deck: DeckZones, byId: Map<string, BuilderCard>): string[] {
  const count = new Map<string, number>();
  for (const z of ["main", "champion"] as Zone[]) {
    for (const [id, q] of Object.entries(deck[z])) {
      const d = byId.get(id)?.domain;
      if (d && d !== "Colorless") count.set(d, (count.get(d) ?? 0) + q);
    }
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([d]) => d);
}

/** Energy curve of the main deck + Champion: cost bucket (0..7, 7 = 7+) -> count. */
export function energyCurve(deck: DeckZones, byId: Map<string, BuilderCard>): number[] {
  const out = [0, 0, 0, 0, 0, 0, 0, 0];
  for (const z of ["main", "champion"] as Zone[]) {
    for (const [id, q] of Object.entries(deck[z])) {
      const e = byId.get(id)?.energyCost;
      if (e == null) continue;
      out[Math.min(7, Math.max(0, e))] += q;
    }
  }
  return out;
}

/** Cheapest buy price of the whole deck (side deck included) in a market; `missing` = copies with no price. */
export function deckPrice(deck: DeckZones, byId: Map<string, BuilderCard>, market: keyof BuilderCard["price"]): { cents: number; missing: number } {
  let cents = 0;
  let missing = 0;
  for (const z of ZONES) {
    for (const [id, q] of Object.entries(deck[z])) {
      const p = byId.get(id)?.price[market];
      if (p == null) missing += q;
      else cents += p * q;
    }
  }
  return { cents, missing };
}

/** Split 12 Runes over the deck's (up to two) domains, in proportion to its cards. */
export function autoRunes(deck: DeckZones, catalog: BuilderCard[], byId: Map<string, BuilderCard>): DeckZones {
  const legendId = Object.keys(deck.legend)[0];
  let doms = deckDomains(deck, byId).slice(0, MAX_DOMAINS);
  const legendDom = legendId ? byId.get(legendId)?.domain : null;
  if (!doms.length && legendDom && legendDom !== "Colorless") doms = [legendDom];
  if (!doms.length) return deck;
  const weight = new Map<string, number>();
  for (const z of ["main", "champion"] as Zone[]) {
    for (const [id, q] of Object.entries(deck[z])) {
      const d = byId.get(id)?.domain;
      if (d && doms.includes(d)) weight.set(d, (weight.get(d) ?? 0) + q);
    }
  }
  const total = doms.reduce((n, d) => n + (weight.get(d) ?? 1), 0);
  const runes: Record<string, number> = {};
  let left = 12;
  doms.forEach((d, i) => {
    const rune = catalog.find((c) => c.type === "Rune" && c.domain === d);
    if (!rune) return;
    const n = i === doms.length - 1 ? left : Math.round((12 * (weight.get(d) ?? 1)) / total);
    runes[rune.id] = (runes[rune.id] ?? 0) + n;
    left -= n;
  });
  return { ...deck, runes };
}

/**
 * Suggestions for the next card: playable in the deck's domains (or the
 * Legend's), not already at the copy limit, ranked by what RiftCompare's
 * visitors look at and search for most. A Legend first when there is none; the
 * Champion units of the Legend next; then cards that fill the curve's gaps.
 */
export function recommend(deck: DeckZones, catalog: BuilderCard[], byId: Map<string, BuilderCard>, limit = 12): { card: BuilderCard; why: string }[] {
  const legendId = Object.keys(deck.legend)[0];
  const legend = legendId ? byId.get(legendId) : undefined;
  if (!legend) {
    return catalog
      .filter((c) => c.type === "Legend")
      .sort((a, b) => b.pop - a.pop)
      .slice(0, limit)
      .map((card) => ({ card, why: "Popular Legend" }));
  }
  const out: { card: BuilderCard; why: string }[] = [];
  if (zoneCount(deck, "champion") === 0) {
    for (const c of catalog) {
      if (c.type === "Unit" && championKey(c.name) === championKey(legend.name)) out.push({ card: c, why: `${legend.name.split(",")[0]} Champion` });
    }
  }
  let doms = deckDomains(deck, byId).slice(0, MAX_DOMAINS);
  if (legend.domain && legend.domain !== "Colorless" && !doms.includes(legend.domain)) doms = [legend.domain, ...doms].slice(0, MAX_DOMAINS);
  const curve = energyCurve(deck, byId);
  // The emptiest of costs 1-5, the part of the curve most decks fill.
  const gap = [1, 2, 3, 4, 5].sort((a, b) => curve[a] - curve[b])[0];
  const pool = catalog
    .filter((c) => (c.type === "Unit" || c.type === "Spell" || c.type === "Gear") && c.domain && (doms.includes(c.domain) || c.domain === "Colorless"))
    .filter((c) => copiesOf(c.name, deck, byId) < COPY_LIMIT && !out.some((o) => o.card.id === c.id))
    .sort((a, b) => {
      const ga = a.energyCost === gap ? 1 : 0;
      const gb = b.energyCost === gap ? 1 : 0;
      return gb - ga || b.pop - a.pop;
    });
  for (const c of pool) {
    if (out.length >= limit) break;
    out.push({ card: c, why: c.energyCost === gap ? `Fills your ${gap}-cost slot` : `Popular in ${c.domain}` });
  }
  if (zoneCount(deck, "battlefields") < 3 && out.length < limit) {
    for (const c of catalog.filter((x) => x.type === "Battlefield" && !deck.battlefields[x.id]).sort((a, b) => b.pop - a.pop).slice(0, 3)) {
      out.push({ card: c, why: "Popular Battlefield" });
    }
  }
  return out.slice(0, limit);
}

// ── Text format (export / import / share) ──────────────────────────────────────

const HEADER: Record<Zone, string> = {
  legend: "Legend",
  champion: "Champion",
  main: "Main deck",
  runes: "Runes",
  battlefields: "Battlefields",
  side: "Side deck",
};

/** "Legend:\n1 Jinx, Loose Cannon (OGN-251)\n\nMain deck:\n3 …" — readable, and /deck parses it too. */
export function deckToText(deck: DeckZones, byId: Map<string, BuilderCard>): string {
  const parts: string[] = [];
  for (const z of ZONES) {
    const lines = Object.entries(deck[z])
      .map(([id, q]) => {
        const c = byId.get(id);
        return c ? `${q} ${c.name} (${c.setCode}-${c.collectorNumber.split("/")[0]})` : null;
      })
      .filter(Boolean) as string[];
    if (lines.length) parts.push(`${HEADER[z]}:\n${lines.join("\n")}`);
  }
  return parts.join("\n\n");
}

const HEADER_TO_ZONE: Record<string, Zone> = {
  legend: "legend",
  legends: "legend",
  champion: "champion",
  "chosen champion": "champion",
  main: "main",
  "main deck": "main",
  deck: "main",
  runes: "runes",
  rune: "runes",
  battlefields: "battlefields",
  battlefield: "battlefields",
  side: "side",
  "side deck": "side",
  sideboard: "side",
};

/**
 * Parse a list (this builder's export, /deck's format, or a plain pasted list)
 * into zones. Lines under a zone header go to that zone; anything else goes
 * where its card type belongs. Returns the names it could not match.
 */
export function textToDeck(text: string, catalog: BuilderCard[]): { deck: DeckZones; unmatched: string[] } {
  const byName = new Map<string, BuilderCard>();
  const bySetNum = new Map<string, BuilderCard>();
  for (const c of catalog) {
    byName.set(c.name.toLowerCase(), c);
    bySetNum.set(`${c.setCode}-${c.collectorNumber.split("/")[0]}`.toLowerCase(), c);
  }
  const byId = new Map(catalog.map((c) => [c.id, c]));
  let deck = emptyDeck();
  const unmatched: string[] = [];
  let zone: Zone | null = null;
  for (const raw of text.split(/\r?\n/).slice(0, 300)) {
    const line = raw.trim();
    if (!line) continue;
    const h = line.replace(/[:\s]+$/, "").replace(/\s*\(\d+\)$/, "").toLowerCase();
    if (HEADER_TO_ZONE[h]) {
      zone = HEADER_TO_ZONE[h];
      continue;
    }
    const m = line.match(/^(\d{1,2})\s*x?\s+(.+?)\s*(?:\(([A-Za-z0-9]+)-([A-Za-z0-9*]+)\))?$/) ?? line.match(/^()(.+?)\s*(?:\(([A-Za-z0-9]+)-([A-Za-z0-9*]+)\))?$/);
    if (!m) continue;
    const qty = Math.max(1, Math.min(12, Number(m[1]) || 1));
    const name = m[2].trim();
    const card = (m[3] && bySetNum.get(`${m[3]}-${m[4]}`.toLowerCase())) || byName.get(name.toLowerCase());
    if (!card) {
      unmatched.push(name);
      continue;
    }
    const target = zone && zoneAccepts(zone, card) ? zone : defaultZone(card, deck, byId);
    for (let i = 0; i < qty; i++) {
      const r = addCard(deck, card, target, byId);
      if (r.refused) break;
      deck = r.deck;
    }
  }
  return { deck, unmatched };
}

// ── Share codes ────────────────────────────────────────────────────────────────

/** No 0/O, 1/I/L: a code read aloud or retyped from a screenshot stays right. */
export const SHARE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const SHARE_CODE_LENGTH = 6;
export const SHARE_CODE_RE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/;

/** A random six-character code; `rand` returns [0, 1). */
export function makeShareCode(rand: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < SHARE_CODE_LENGTH; i++) s += SHARE_ALPHABET[Math.floor(rand() * SHARE_ALPHABET.length)];
  return s;
}

export function normaliseShareCode(raw: string | null | undefined): string | null {
  const c = (raw ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return SHARE_CODE_RE.test(c) ? c : null;
}

/** Stable hash of a deck text, so the same deck shared twice gets the same code. */
export function listHash(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 16777619) >>> 0;
    h2 = (Math.imul(h2, 31) + ch) >>> 0;
  }
  return h1.toString(36) + h2.toString(36) + text.length.toString(36);
}

export const SHARE_LIST_MAX = 6000;

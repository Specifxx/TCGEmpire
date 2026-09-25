// Parser + resolver for pasted Riftbound card lists — decklists in TCGplayer
// Mass Entry style and its variants, and (since /deck absorbed the Bulk Pricer,
// 2026-09-25) plain lists of card names. Entry lines look like:
//   3 Jinx, Loose Cannon
//   3x Jinx, Loose Cannon (OGN-251)
//   1 OGN-247
//   Jinx, Loose Cannon            ← plain name: one copy
//   Jinx, Loose Cannon x3         ← trailing quantity
// Section headers ("Legend:", "Main Deck (40)", "Runes") and notes are skipped.
//
// This file must stay free of runtime server imports: the /deck page's client
// component shares its line formatting. resolveDeckLines takes its database
// access as a parameter for the same reason (and so tests can run it without
// one); the Prisma import below is type-only.

import type { Prisma } from "@prisma/client";
import { normalizeSearch } from "./format";

export interface ParsedLine {
  raw: string;
  qty: number;
  name: string;
  setCode?: string;
  number?: string; // lowercased, keeps a Signature's "*" (e.g. "301*")
}

export interface ParseOptions {
  // Accept lines with no leading quantity as one copy (a bulk list of names).
  // Without it such lines are ignored, as a strict decklist parser always did.
  plainNames?: boolean;
}

// The words deck exports use as section headings. Only a line that is JUST one
// of these (optionally with a count) counts — "Hall of Legends" is a card.
const HEADER_WORDS =
  /^(?:legends?|champions?|chosen\s+champions?|signatures?(?:\s+cards?)?|main(?:\s*deck)?|deck(?:\s*list)?|battlefields?|runes?(?:\s+deck)?|side\s*(?:deck|board)|sideboard|spells?|units?|gears?|tokens?|total|cards?)$/i;

// "Legend:", "Main Deck (40)", "Runes - 12", "Total: 40 cards", "Battlefields".
// Pasted section headers used to be priced as cards: the Bulk Pricer prefixed a
// "1 " onto every line, and the substring fallback then matched "Legend:" to
// Hall of Legends and "Champion:" to Scrapyard Champion (audit, 2026-09-25).
export function isSectionHeader(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/:\s*$/.test(t)) return true;
  const core = t.replace(/\s*[:(\[\-–—]?\s*\d+\s*(?:cards?)?\s*[)\]]?\s*$/i, "").trim();
  return HEADER_WORDS.test(core);
}

// "Legend: Jinx, Loose Cannon" — a header and a card on one line.
const INLINE_HEADER = /^(?:legend|champion|chosen\s+champion|signature|battlefield|rune)s?\s*:\s*(.+)$/i;

// Set-number token like (OGN-251), OGN-251, OGN 039a or a Signature's OGN-301*.
const SET_NUMBER = /\(?\b([A-Za-z]{2,4})[-\s](\d+[a-z]?\*?)(?![\w*])\)?/;

export function parseDeckList(text: string, opts: ParseOptions = {}): ParsedLine[] {
  const out: ParsedLine[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("//") || line.startsWith("#")) continue;
    if (isSectionHeader(line)) continue;

    let qty: number;
    let rest: string;
    const lead = line.match(/^(\d+)\s*[xX×]?\s+(.+)$/);
    if (lead) {
      qty = parseInt(lead[1], 10);
      rest = lead[2].trim();
    } else if (opts.plainNames) {
      // "Name x3", "Name ×3" or "Name<TAB>3"; otherwise one copy.
      const trail = line.match(/^(.*\S)\s+[xX×]\s*(\d{1,3})$/) ?? line.match(/^(.*\S)\t+(\d{1,3})$/);
      if (trail) {
        qty = parseInt(trail[2], 10);
        rest = trail[1].trim();
      } else {
        qty = 1;
        rest = line;
      }
    } else {
      continue; // header / note line
    }
    qty = Math.min(99, Math.max(1, qty || 1));

    const inline = rest.match(INLINE_HEADER);
    if (inline) rest = inline[1].trim();
    if (isSectionHeader(rest)) continue;

    // Pull out a set-number token.
    let setCode: string | undefined;
    let number: string | undefined;
    const sn = rest.match(SET_NUMBER);
    if (sn) {
      setCode = sn[1].toUpperCase();
      number = sn[2].toLowerCase();
      rest = rest.replace(sn[0], "").trim();
    }

    // Clean leftover separators / empty parens.
    rest = rest.replace(/\(\s*\)/g, "").replace(/[\-–·|]+\s*$/, "").trim();
    if (!rest && !number) continue;

    out.push({ raw: line, qty, name: rest, setCode, number });
  }
  return out;
}

// One line per card, round-trippable through parseDeckList. A printing that
// was picked exactly carries its set and number (a Signature keeps its "*"),
// so a shared or handed-off list resolves to the same card; `pinned: false`
// writes the bare name, which re-resolves to the cheapest printing.
export function formatDeckLine(qty: number, card: { name: string; setCode: string; collectorNumber: string }, pinned = true): string {
  return pinned ? `${qty} ${card.name} (${card.setCode}-${card.collectorNumber.split("/")[0]})` : `${qty} ${card.name}`;
}

// ── Resolving lines to cards ─────────────────────────────────────────────────

export const DECK_LINE_CAP = 200;

export interface ResolvableCard {
  id: string;
  nameNormalized: string;
  setCode: string;
  collectorNumber: string;
}

// The single database call this needs, e.g.
//   (args) => prisma.card.findMany({ ...args, select, orderBy: cheapestFirst })
// Results must come back cheapest first for the market: when several printings
// share a name or number, the first one wins.
export type CardFinder<C extends ResolvableCard> = (args: { where: Prisma.CardWhereInput; take?: number }) => Promise<C[]>;

export interface ResolvedLine<C> {
  line: ParsedLine;
  card: C | null;
  // Matched only by the name-contains fallback — a guess the UI must show as
  // one ("matched as X"), never count silently.
  fuzzy: boolean;
}

export interface DeckResolution<C> {
  items: ResolvedLine<C>[]; // every card line, in input order
  matched: (ResolvedLine<C> & { card: C })[];
  unmatched: ParsedLine[];
  fuzzy: (ResolvedLine<C> & { card: C })[];
}

const numberKey = (setCode: string, number: string) => `${setCode.toUpperCase()}-${number.toLowerCase()}`;

// Set + collector number first (scoped to the line's set: 810 of 950 cards
// share their number with a card in another set), then exact name, then a
// bounded name-contains fallback flagged fuzzy. Header lines are skipped.
// At most three queries, each scoped to this list and capped.
export async function resolveDeckLines<C extends ResolvableCard>(
  input: ParsedLine[],
  find: CardFinder<C>
): Promise<DeckResolution<C>> {
  const lines = input
    .slice(0, DECK_LINE_CAP)
    .filter((l) => l.number || (l.name && !isSectionHeader(l.name)));
  const items: ResolvedLine<C>[] = lines.map((line) => ({ line, card: null, fuzzy: false }));

  // 1. Set + number.
  const numbered = new Map<string, { setCode: string; number: string }>();
  for (const l of lines) {
    if (l.setCode && l.number) numbered.set(numberKey(l.setCode, l.number), { setCode: l.setCode.toUpperCase(), number: l.number.toLowerCase() });
  }
  if (numbered.size) {
    const cards = await find({
      where: {
        OR: [...numbered.values()].map((k) => ({
          setCode: k.setCode,
          OR: [{ collectorNumber: { startsWith: `${k.number}/` } }, { collectorNumber: k.number }],
        })),
      },
    });
    const byNum = new Map<string, C>();
    for (const c of cards) {
      const k = numberKey(c.setCode, c.collectorNumber.split("/")[0]);
      if (!byNum.has(k)) byNum.set(k, c);
    }
    for (const it of items) {
      const l = it.line;
      if (l.setCode && l.number) it.card = byNum.get(numberKey(l.setCode, l.number)) ?? null;
    }
  }

  // 2. Exact name.
  const nameless = items.filter((it) => !it.card && it.line.name);
  const nqs = [...new Set(nameless.map((it) => normalizeSearch(it.line.name)).filter(Boolean))];
  if (nqs.length) {
    const cards = await find({ where: { nameNormalized: { in: nqs } } });
    const byName = new Map<string, C>();
    for (const c of cards) if (!byName.has(c.nameNormalized)) byName.set(c.nameNormalized, c);
    for (const it of nameless) it.card = byName.get(normalizeSearch(it.line.name)) ?? null;
  }

  // 3. Name contains — bounded: at most five rows per unresolved line, 200 in
  // all. (It had no take, on an unauthenticated route: 200 short fragments
  // could return most of the card table.)
  const unresolved = items.filter((it) => !it.card && normalizeSearch(it.line.name).length >= 3);
  const frags = [...new Set(unresolved.map((it) => normalizeSearch(it.line.name)))];
  if (frags.length) {
    const cards = await find({
      where: { OR: frags.map((f) => ({ nameNormalized: { contains: f } })) },
      take: Math.min(frags.length * 5, 200),
    });
    for (const it of unresolved) {
      const nq = normalizeSearch(it.line.name);
      const hit = cards.find((c) => c.nameNormalized.includes(nq));
      if (hit) {
        it.card = hit;
        it.fuzzy = true;
      }
    }
  }

  const matched = items.filter((it): it is ResolvedLine<C> & { card: C } => it.card != null);
  return {
    items,
    matched,
    unmatched: items.filter((it) => !it.card).map((it) => it.line),
    fuzzy: matched.filter((it) => it.fuzzy),
  };
}

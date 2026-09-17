// The card page's <title> and meta description, as pure functions.
//
// EXTRACTED FROM generateMetadata SO THEY CAN BE TESTED. Both were inline in
// src/app/card/[id]/page.tsx, which needs Prisma to reach — so the 60-character
// title guard, the single highest-volume SEO invariant on the site (~1,400
// pages), had no test at all. It was wrong for every Signature and Overnumbered
// card and nothing caught it. These take plain data and return strings; the
// route does the database work and calls them.
//
// Nothing here imports Prisma, the route, or card-narrative (which would be a
// cycle — card-narrative imports shortCardName from card-name, as this does).

import { shortCardName } from "./card-name";
import { PRINTING_DISPLAY, PRINTING_PROSE, type PrintingKind } from "./content/card-narrative";

const SUFFIX = " | RiftCompare";

/** Google truncates around here; the root layout appends SUFFIX via `absolute`. */
export const TITLE_MAX = 60;

export const titleFits = (t: string): boolean => `${t}${SUFFIX}`.length <= TITLE_MAX;

export interface CardTitleInput {
  name: string;
  /** cardDisplayName(name, card) — "Shen, Eye of Twilight (Showcase, Signature)". */
  displayName: string;
  setName: string;
  /** `${setCode} ${collectorNumber}` — the only field that separates two
   *  printings sharing a displayName and setCode, so every candidate keeps it. */
  identCode: string;
  hasPrice: boolean;
  kind: PrintingKind;
}

/**
 * The title, chosen from a longest-first ladder.
 *
 * The first three candidates are EXACTLY what shipped before this file existed,
 * so base-card titles are byte-identical and ~1,200 pages see no change at all.
 * Candidates 4-6 are new and only exist for special printings, because that is
 * the only place the ladder was broken:
 *
 *   "Shen, Eye of Twilight (Showcase, Signature) — Riftbound VEN 193★/166"
 *
 * is 82 characters with the suffix. Every candidate overflowed, so the `??`
 * fallthrough returned an over-long title and Google cut it — and what it cut
 * was the trailing "Riftbound", the one word the target query
 * ("shen signature riftbound") depends on.
 *
 * The new rungs shorten the two redundant parts rather than dropping the ident:
 *   • "(Showcase, Signature)" → "Signature". Showcase is the rarity of every
 *     Signature print, so the pair says one thing twice.
 *   • "Shen, Eye of Twilight" → "Shen". This is the load-bearing one: even
 *     `${name} Signature — Riftbound VEN 193★/166` is 70 characters. Only the
 *     short form fits (53, or 59 with "Price"), and it is also what people
 *     actually type.
 *
 * Candidate 6 drops "Price" as a last resort — a long name with a long set code
 * can still overflow rung 5, and losing the word "Price" costs less than losing
 * "Riftbound" or the collector number.
 */
export function cardTitle(input: CardTitleInput): string {
  const { name, displayName, setName, identCode, hasPrice, kind } = input;

  const base = hasPrice
    ? [
        `${displayName} Price — Riftbound ${setName} (${identCode})`,
        `${displayName} Price — Riftbound ${identCode}`,
        `${displayName} — Riftbound ${identCode}`,
      ]
    : [
        `${displayName} — Riftbound ${setName} (${identCode}) | Card Text`,
        `${displayName} — Riftbound ${identCode} | Card Text`,
        `${displayName} — Riftbound ${identCode}`,
      ];

  const candidates = [...base];
  if (kind !== "base") {
    const P = PRINTING_DISPLAY[kind];
    const priceWord = hasPrice ? " Price" : "";
    const short = shortCardName(name);
    candidates.push(`${name} ${P}${priceWord} — Riftbound ${identCode}`);
    if (short !== name) {
      candidates.push(`${short} ${P}${priceWord} — Riftbound ${identCode}`);
      if (priceWord) candidates.push(`${short} ${P} — Riftbound ${identCode}`);
    }
  }

  return candidates.find(titleFits) ?? candidates[candidates.length - 1];
}

export interface CardDescriptionInput {
  displayName: string;
  identCode: string;
  setName: string;
  collectorNumber: string;
  kind: PrintingKind;
  /** Clamped rules text, or null when the card prints none. */
  textBit: string | null;
  /** "Fury unit · Showcase" — the stat line, used only in the no-text branch. */
  statBit: string;
  priceBit: string;
  /** Community nicknames for this exact printing (lib/content/card-aliases.ts). */
  aliases?: string[];
}

/**
 * The meta description.
 *
 * TWO FIXES OVER THE INLINE VERSION, both about the same blind spot. The
 * printing phrase used to appear only in the no-rules-text branch, so the
 * ~90% of cards that DO print rules text never said which printing they were in
 * words — only inside the parenthetical of displayName. And the `kind` handed
 * in was computed from a query that selected none of the fields Signature,
 * Overnumbered or Crystal Rose are derived from, so it was "base" for all three
 * regardless. Both branches now name the printing when there is one to name.
 *
 * Base printings still get nothing added: there is no distinguishing fact to
 * state and padding one in would be the fabrication this avoids.
 */
export function cardMetaDescription(input: CardDescriptionInput): string {
  const { displayName, identCode, setName, collectorNumber, kind, textBit, statBit, priceBit } = input;
  const aliases = input.aliases ?? [];

  const special = kind !== "base";
  let description: string;
  if (textBit) {
    description = special
      ? `${displayName} — the ${PRINTING_PROSE[kind]} printing (Riftbound ${identCode}). ${textBit} ${priceBit}`
      : `${displayName} (Riftbound ${identCode}) — ${textBit} ${priceBit}`;
  } else {
    const printingBit = special ? `the ${PRINTING_PROSE[kind]} printing of a ` : "";
    description = `${displayName} — ${printingBit}${printingBit ? statBit.toLowerCase() : statBit} from Riftbound ${setName} (${collectorNumber}). ${priceBit}`;
  }

  // A nickname is a real query shape ("armpit boi riftbound") and the only place
  // the site can answer it. Appended last so it never displaces the price.
  if (aliases.length > 0) {
    description += ` Also known as "${aliases.join('", "')}".`;
  }
  return description;
}

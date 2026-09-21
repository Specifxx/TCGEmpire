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
  /**
   * cardCredentials(card) — ["Showcase"] and nothing else, for a base printing.
   *
   * REQUIRED because the shortened rungs below must not drop it. `displayName`
   * carries these inside a parenthetical, and that parenthetical is the only
   * thing separating the titles of a Showcase printing and its plain sibling —
   * which share a name, a set and, near enough, a collector number ("151a/298"
   * vs "151/298"). Shorten to `shortCardName` without re-adding them and the two
   * titles differ by one character sitting next to digits, which is precisely the
   * near-duplicate shape Google clusters and leaves one of unindexed.
   */
  credentials: string[];
  /**
   * Card.type — Unit | Spell | Gear | Rune | Battlefield | Legend.
   *
   * REQUIRED, not optional, and deliberately so. An optional field with a quiet
   * default is exactly how generateMetadata ended up computing the printing from
   * a query that selected none of the fields it needed; making this a compile
   * error at the call site is the cheap version of that lesson.
   */
  type: string;
}

/**
 * The title, chosen from a longest-first ladder.
 *
 * ── WHAT THE LADDER IS TRADING ──────────────────────────────────────────────
 * 60 characters including " | RiftCompare" does not fit a Riftbound champion
 * card. Something has to go, and the order below is the order we are willing to
 * lose things in: the set NAME first, then the card's epithet, then the word
 * "Price", and never the collector number or the word "Riftbound".
 *
 * The epithet ranks BELOW "Price" on purpose, and that is the one judgement call
 * here. `Ahri, Nine-Tailed Fox — Riftbound OGN 255/298` is 59 characters and is
 * what this card's title used to be: it fits, it is accurate, and it tells a
 * searcher nothing about why they would click. `Ahri Legend Price — Riftbound
 * OGN 255/298` is 55 and tells them three useful things. The /card template
 * earns a 0.41% click-through rate — the worst of any template on the site —
 * and the epithet is the cheapest thing in the string. The full name is still
 * the H1, the breadcrumb, the meta description and the Product `name`.
 *
 * ── WHY "Legend" AND NO OTHER TYPE ──────────────────────────────────────────
 * "kennen legend riftbound" is a real query shape; "ahri unit riftbound" is not.
 * A Legend is the one card a deck is built around and there is one per champion
 * per set, so the type is genuinely identifying. For a Unit or a Spell it would
 * be seven wasted characters, so no other type gets a rung.
 *
 * ── WHAT CANNOT MOVE ────────────────────────────────────────────────────────
 * A card whose name has no comma has `short === name`, so the short-name rungs
 * collapse into their full-name siblings and are dropped by the de-duplication
 * below. Those titles are byte-identical to what shipped before this rung
 * existed — see tests/card-type-seo.test.ts, which pins one.
 *
 * Special printings (kind !== "base") skip the type rungs entirely: the printing
 * is what separates two rows that share a name, so it always outranks the type.
 * Their rungs are unchanged from the previous pass.
 */
export function cardTitle(input: CardTitleInput): string {
  const { name, displayName, setName, identCode, hasPrice, kind, type, credentials } = input;

  const short = shortCardName(name);
  const legend = type === "Legend" ? " Legend" : "";
  // Space-joined rather than parenthesised, because these rungs are already
  // fighting for characters: "Lee Sin Showcase" beats "Lee Sin (Showcase)" by two
  // and reads the same. What matters is that it is PRESENT — see `credentials`.
  const creds = credentials.length ? ` ${credentials.join(" ")}` : "";
  // The two shapes the ladder alternates between: a priced card advertises the
  // price, an unpriced one advertises the rules text. Same slot, same cost.
  const priced = (subject: string) =>
    hasPrice ? `${subject} Price — Riftbound ${identCode}` : `${subject} — Riftbound ${identCode} | Card Text`;
  const bare = (subject: string) => `${subject} — Riftbound ${identCode}`;

  const candidates: string[] = [
    hasPrice
      ? `${displayName} Price — Riftbound ${setName} (${identCode})`
      : `${displayName} — Riftbound ${setName} (${identCode}) | Card Text`,
    priced(displayName),
  ];

  if (kind === "base") {
    // Shed the set name (rung 1 → 2), then the EPITHET (2 → 3), then the type
    // word, then "Price". The credentials never come off: they are load-bearing
    // for uniqueness in a way the epithet is not, and a title that collides is a
    // title Google may drop entirely.
    candidates.push(priced(`${short}${legend}${creds}`), priced(`${short}${creds}`));
    candidates.push(bare(displayName));
    candidates.push(bare(`${short}${legend}${creds}`), bare(`${short}${creds}`));
  } else {
    candidates.push(bare(displayName));
    const P = PRINTING_DISPLAY[kind];
    const priceWord = hasPrice ? " Price" : "";
    candidates.push(`${name} ${P}${priceWord} — Riftbound ${identCode}`);
    if (short !== name) candidates.push(`${short} ${P}${priceWord} — Riftbound ${identCode}`);
    // Drop "Price" but keep the SINGLE printing word. This used to sit inside the
    // `short !== name` branch, which meant a comma-less name could never reach it
    // — and the catalogue audit found what that cost:
    //
    //   "Seal of Discord Showcase Overnumbered — Riftbound SFD 234/221"  75
    //
    // That is the last-resort rung below, falling back on `cardCredentials`, which
    // for an overnumbered printing is ["Showcase", "Overnumbered"] — and Showcase
    // is the rarity of every overnumbered reprint, so the pair says one thing
    // twice. PRINTING_DISPLAY says it once: "Seal of Discord Overnumbered —
    // Riftbound SFD 234/221" is 66. Same redundancy the previous pass removed
    // from Signature titles, in the population it did not reach.
    if (priceWord) {
      candidates.push(`${name} ${P} — Riftbound ${identCode}`);
      if (short !== name) candidates.push(`${short} ${P} — Riftbound ${identCode}`);
    }
  }

  // TWO UNIVERSAL LAST RESORTS, and they exist because the first version of this
  // ladder did not have them. A catalogue-wide audit
  // (scripts/audit-card-titles.ts, run 2026-09-17) found 69 titles still over 60,
  // and they were NOT the comma-less long names the ladder was designed around —
  // they were special printings whose name happens to have no comma:
  //
  //   "Plundering Poro Overnumbered Price — Riftbound UNL 222/219"   (72)
  //   "Red Brambleback Alternate art Price — Riftbound UNL 029a/219" (74)
  //
  // Every rung above them either kept "Price" or kept the full printing word, and
  // with no champion half there was nothing left to shorten, so the `??` returned
  // an over-long title. These two rungs shed the credential to its abbreviated
  // form ("Alternate art" → "Alt Art", which is what cardCredentials already
  // calls it) and then, only if that still overflows, shed it entirely.
  //
  // THE CREDENTIAL NEVER COMES OFF, and the first version of this rung got that
  // wrong. It also offered `bare(short)` — the credential dropped entirely — on
  // the reasoning that identCode keeps every title unique. That reasoning was
  // false: a PROMO SHARES ITS BASE CARD'S COLLECTOR NUMBER. That is why
  // cardSlug() appends a "-promo" suffix at all (lib/card-url.ts). So base
  // "Eye of the Herald" SFD 153/221 and its promo both reduce to
  // "Eye of the Herald — Riftbound SFD 153/221", and scripts/audit-card-titles.ts
  // caught it as a hard duplicate on the very next run.
  //
  // Uniqueness outranks length, and not by a little: a duplicate title fails
  // scripts/seo-gate.ts and can cost a page its place in the index, while an
  // over-long one loses a few characters of collector number to truncation. So
  // this is the last rung, and a handful of comma-less special printings with a
  // long name still exceed 60 — "Plundering Poro Overnumbered — Riftbound
  // UNL 222/219" is 67 and there is nothing left to shed but the credential
  // itself. That is the right trade, and the audit reports the residue.
  candidates.push(bare(`${short}${creds}`));

  // De-duplicate in place. For a comma-less card with no credentials the type
  // rungs are literally the same string as the rungs above them, and leaving the
  // repeats in would make the ladder's shape depend on the card rather than on
  // the rule.
  const ladder = candidates.filter((c, i) => candidates.indexOf(c) === i);
  // WHEN NOTHING FITS, SHIP THE SHORTEST — not the last one written down.
  //
  // The old fallthrough was `?? ladder[ladder.length - 1]`, and the catalogue
  // audit is how that showed up as a real cost. For an overnumbered printing with
  // a comma-less name, the ladder produces
  //
  //   "Seal of Discord Overnumbered — Riftbound SFD 234/221"           (66)
  //   "Seal of Discord Showcase Overnumbered — Riftbound SFD 234/221"  (75)
  //
  // in that order, neither fits, and taking the LAST one shipped the worse of the
  // two — nine characters of extra truncation for a word ("Showcase") that is the
  // rarity of every overnumbered reprint and therefore says nothing the next word
  // does not. Rung ORDER expresses what we would rather keep; it is not a claim
  // about length, so it must not decide the overflow case. Ties keep the earlier
  // rung, so this changes nothing for any card that has a fitting candidate.
  return ladder.find(titleFits) ?? ladder.reduce((a, b) => (b.length < a.length ? b : a));
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
 * THE SAME BLIND SPOT, TWICE. `statBit` ("Calm legend · Rare") and the printing
 * phrase were both built for every card and then used only in the branch for
 * cards that print NO rules text. Since ~90% of the catalogue does print rules
 * text, the overwhelming majority of descriptions named neither the card's
 * domain, nor its type, nor its rarity, nor which printing it was — the snippet
 * for a Signature Legend read exactly like the snippet for a common spell. The
 * structured data carried all four fields the whole time, which is backwards:
 * the visible snippet is the thing a person reads before deciding to click.
 *
 * Both branches now carry both facts. The order is deliberate and unchanged in
 * spirit: what the card IS, then what it DOES, then what it COSTS.
 */
export function cardMetaDescription(input: CardDescriptionInput): string {
  const { displayName, identCode, setName, collectorNumber, kind, textBit, statBit, priceBit } = input;
  const aliases = input.aliases ?? [];

  const special = kind !== "base";
  let description: string;
  if (textBit) {
    description = special
      ? `${displayName} — ${statBit}, the ${PRINTING_PROSE[kind]} printing (Riftbound ${identCode}). ${textBit} ${priceBit}`
      : `${displayName} — ${statBit} (Riftbound ${identCode}). ${textBit} ${priceBit}`;
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

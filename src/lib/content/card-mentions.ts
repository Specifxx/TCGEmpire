// Card mentions in articles → links to the card page (2026-09-26).
//
// Pure and dependency-free: the ArticleView resolves the name index and the
// prices at ISR render time and passes them in, so nothing here runs per request.
//
// RULES, each for a reason:
//  • FIRST unlinked mention of each card only — a post that says "Falling Star"
//    nine times gets one link, not nine.
//  • EXACT, case-sensitive, whole-name matches of names with two or more words.
//    Single-word card names ("Recall", "Stun", "Rally") are ordinary English in
//    a strategy post; linking them would assert card references the author
//    never made.
//  • Never inside an existing [link](…), `code`, an image line, a heading, or a
//    [[shortcode]] line; a card the author already linked is not linked again.
//  • Longest names first, so "Jinx, Loose Cannon" wins over a shorter name that
//    is a prefix of it.

export interface CardNameEntry {
  name: string;
  /** Site-relative card path, e.g. /card/falling-star-ogn-029-298. */
  href: string;
}

const CARD_LINK = /\]\((\/card\/[^)\s#?]+)\)/g;

/** Every /card/… href linked anywhere in a markdown body, in order, deduped. */
export function cardHrefsIn(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(CARD_LINK)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

/** True for a name we are willing to auto-link (see RULES above). */
export function linkableName(name: string): boolean {
  return name.trim().split(/\s+/).length >= 2 && name.length <= 60;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Spans a match must not start inside: links (whole [text](url)), inline code,
// bold/italic markers are fine to link inside.
const PROTECTED = /\[[^\]]*\]\([^)]*\)|`[^`]*`/g;

function isProtectedLine(line: string): boolean {
  const t = line.trim();
  return /^#{1,6}\s/.test(t) || /^!\[/.test(t) || /^\[\[/.test(t);
}

/**
 * Wraps the first unlinked mention of each known card name in a markdown link
 * to its card page. Returns the new body; the original is untouched when no
 * name matches.
 */
export function autoLinkCardNames(body: string, entries: CardNameEntry[]): string {
  const already = new Set(cardHrefsIn(body));
  const candidates = entries
    .filter((e) => linkableName(e.name) && !already.has(e.href))
    .sort((a, b) => b.name.length - a.name.length);
  if (!candidates.length) return body;

  const linkedNames = new Set<string>();
  const lines = body.split("\n");
  for (let li = 0; li < lines.length; li++) {
    let line = lines[li];
    if (isProtectedLine(line)) continue;
    for (const e of candidates) {
      if (linkedNames.has(e.name) || !line.includes(e.name)) continue;
      const protectedRanges: [number, number][] = [];
      for (const m of line.matchAll(PROTECTED)) protectedRanges.push([m.index!, m.index! + m[0].length]);
      const re = new RegExp(`(?<![\\p{L}\\p{N}'’-])${escapeRe(e.name)}(?![\\p{L}\\p{N}'’-])`, "gu");
      let hit: RegExpExecArray | null;
      while ((hit = re.exec(line)) !== null) {
        const at = hit.index;
        if (protectedRanges.some(([a, b]) => at >= a && at < b)) continue;
        line = `${line.slice(0, at)}[${e.name}](${e.href})${line.slice(at + e.name.length)}`;
        linkedNames.add(e.name);
        break;
      }
    }
    lines[li] = line;
  }
  return lines.join("\n");
}

/**
 * The printing a bare card NAME should link to: the base printing (no variant,
 * not a promo) with the lowest collector number, else the first printing.
 * `cards` must all share one name.
 */
export function canonicalPrinting<T extends { variant: string | null; isPromo: boolean; collectorNumber: string }>(
  cards: T[],
): T | null {
  if (!cards.length) return null;
  const base = cards.filter((c) => !c.variant && !c.isPromo);
  const pool = base.length ? base : cards;
  return [...pool].sort((a, b) => a.collectorNumber.localeCompare(b.collectorNumber, "en", { numeric: true }))[0];
}

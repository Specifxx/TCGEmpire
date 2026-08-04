// Table-of-contents extraction for file-based article bodies.
//
// The article template renders a "On this page" TOC above long posts. It is built
// from the SAME markdown the body renders, so it can never list a heading that
// isn't there — and both sides derive the anchor id from headingId(), so a TOC
// link always resolves.
//
// Beyond navigation, the TOC is a real SEO/GEO asset: it gives Google the
// jump-links it shows as sitelinks under a result, and it gives an answer engine
// an explicit outline of what the page covers before it reads a word of prose.

export interface TocEntry {
  /** 2 = "##", 3 = "###". */
  level: 2 | 3;
  text: string;
  id: string;
}

/** Stable, URL-safe anchor id for a heading's visible text. */
export function headingId(text: string): string {
  return text
    .toLowerCase()
    // Drop inline markdown marks so "**Bold** heading" and "Bold heading" agree.
    .replace(/\*\*|__|`/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Every ## / ### heading in a markdown body, in document order.
 * Skips headings inside fenced code blocks (we don't use them today, but a body
 * containing a `#` inside a fence would otherwise produce a phantom entry).
 */
export function extractToc(body: string): TocEntry[] {
  const out: TocEntry[] = [];
  let inFence = false;
  const seen = new Map<string, number>();
  for (const raw of body.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    if (line.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = line.match(/^(#{2,3})\s+(.*)$/);
    if (!m) continue;
    const text = m[2].trim();
    const base = headingId(text);
    if (!base) continue;
    // Two headings with the same text would otherwise share an id and the second
    // link would jump to the first.
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    out.push({ level: m[1].length === 2 ? 2 : 3, text, id: n === 1 ? base : `${base}-${n}` });
  }
  return out;
}

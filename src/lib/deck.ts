// Parser for pasted Riftbound decklists (TCGplayer Mass Entry style + variants).
// Each entry line looks like:
//   3 Jinx, Loose Cannon
//   3x Jinx, Loose Cannon (OGN-251)
//   1 OGN-247
// Lines without a leading quantity (section headers, notes, blanks) are ignored.

export interface ParsedLine {
  raw: string;
  qty: number;
  name: string;
  setCode?: string;
  number?: string;
}

export function parseDeckList(text: string): ParsedLine[] {
  const out: ParsedLine[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("//") || line.startsWith("#")) continue;

    const m = line.match(/^(\d+)\s*[xX]?\s+(.+)$/);
    if (!m) continue; // header / note line

    const qty = Math.min(99, Math.max(1, parseInt(m[1], 10) || 1));
    let rest = m[2].trim();

    // Pull out a set-number token like (OGN-251), OGN-251 or OGN 039a.
    let setCode: string | undefined;
    let number: string | undefined;
    const sn = rest.match(/\(?\b([A-Za-z]{2,4})[-\s](\d+[a-z]?)\b\)?/);
    if (sn) {
      setCode = sn[1].toUpperCase();
      number = sn[2].toLowerCase();
      rest = rest.replace(sn[0], "").trim();
    }

    // Clean leftover separators / empty parens.
    rest = rest.replace(/\(\s*\)/g, "").replace(/[\-–·|]+\s*$/, "").trim();

    out.push({ raw: line, qty, name: rest, setCode, number });
  }
  return out;
}

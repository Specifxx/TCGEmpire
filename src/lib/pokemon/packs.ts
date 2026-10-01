// How many booster packs a sealed product holds — the basis of "price per
// pack", the one comparison that lets a buyer weigh an ETB against a booster
// bundle against a box. Pure and client-safe.
//
// THE RULE: a count comes from the product's own published contents list
// whenever it has one ("9 Pokémon TCG: … booster packs", "(4) … booster
// packs", "Includes six … booster packs"). Only four shapes are counted from the
// NAME, each of which is that shape by definition: a single pack (1), an
// "N Pack Blister" (N), a booster bundle (6) and a main-expansion booster box
// (36, or 18 for a half box). Everything else without a contents list gets no
// count and no per-pack price — never a guess (CURRENT-STATE "Accuracy").
// Pinned against real titles in tests/pokemon-packs.test.ts.

import { foldName, type PkKind } from "./kinds";

export interface PackCount {
  count: number;
  /** Where the number came from, so the page can say so. */
  from: "contents" | "name";
}

const WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  sixteen: 16, eighteen: 18, twenty: 20, "thirty-six": 36, "thirty six": 36,
};
const NUM = `\\(?(\\d{1,3})\\)?|(${Object.keys(WORDS).join("|")})`;
// "<n> <anything but a sentence break> booster pack(s)", never "Each booster pack …"
// and never "3-card fun packs" (not a booster).
const LINE = new RegExp(`(?:^|\\b(?:includes?|contains?|with|and|plus)\\s+)(?:${NUM})\\s+([^.|]{0,90}?)\\bbooster packs?\\b`, "i");
// A pack that is not a standard booster ("four-card", "3-card fun pack") makes
// a per-pack figure meaningless: Celebrations' ETB mixes ten 4-card packs with
// five standard ones. Such a product gets no count at all, whether its contents
// or its NAME says so: "Trick or Trade BOOster Bundle 2023 - Mini Booster Pack"
// is one three-card pack that TCGplayer's title files as a booster bundle.
const ODD_PACK = /\b(?:\d+|one|two|three|four|five|six)[- ]card\b[^.|]{0,30}\bpacks?\b|\bfun packs?\b|\bmini[- ](?:booster[- ])?packs?\b/;

function countIn(line: string): number | null {
  const l = foldName(line).replace(/\s+/g, " ").trim();
  const m = LINE.exec(l);
  if (!m) return null;
  const n = m[1] ? Number(m[1]) : WORDS[m[2]];
  return Number.isFinite(n) && n > 0 && n <= 400 ? n : null;
}

export function packCount(p: {
  name: string;
  kind: PkKind;
  contents: readonly string[];
  /** A main numbered expansion (TCGplayer group "SV05:", "ME02:", "SWSH07:"), whose English booster box is 36 packs. */
  mainExpansion?: boolean;
}): PackCount | null {
  if (ODD_PACK.test(foldName(p.name)) || p.contents.some((line) => ODD_PACK.test(foldName(line)))) return null;
  let total = 0;
  for (const line of p.contents) {
    const n = countIn(line);
    if (n != null) total += n;
  }
  if (total > 0) return { count: total, from: "contents" };

  const name = foldName(p.name);
  if (p.kind === "booster-pack" && !/\bart bundle\b|\bset of\b/.test(name)) return { count: 1, from: "name" };
  if (p.kind === "blister") {
    const m = /\b(\d|single)[ -]pack blisters?\b/.exec(name);
    if (m) return { count: m[1] === "single" ? 1 : Number(m[1]), from: "name" };
  }
  if (p.kind === "booster-bundle") return { count: 6, from: "name" };
  // "Enhanced" boxes add promos and their pack count varies, so they are not counted by name.
  if (p.kind === "booster-box" && p.mainExpansion && !/\benhanced\b/.test(name)) return { count: /\bhalf\b/.test(name) ? 18 : 36, from: "name" };
  return null;
}

/** Cents per pack, rounded to the cent; null when either side is unknown. */
export function perPackCents(priceCents: number | null | undefined, packs: number | null | undefined): number | null {
  if (priceCents == null || !packs || packs <= 0) return null;
  return Math.round(priceCents / packs);
}

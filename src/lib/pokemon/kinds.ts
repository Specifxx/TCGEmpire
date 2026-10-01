// Pokémon sealed product kinds — the taxonomy every Pokémon surface shares
// (tiles, filters, the quick view, eBay queries, the importer). Pure and
// client-safe.
//
// Classified from the product NAME, the way TCGplayer titles them
// ("Phantasmal Flames Pokemon Center Elite Trainer Box (Exclusive)"), most
// specific rule first. Checked against every English sealed product TCGplayer
// lists from Sword & Shield onward on 2026-10-01 (1,943 titles,
// tests/pokemon-catalog.test.ts pins the hard cases).

export type PkKind =
  | "booster-box"
  | "etb"
  | "pc-etb"
  | "booster-bundle"
  | "upc"
  | "spc"
  | "premium-collection"
  | "collection"
  | "build-battle"
  | "tin"
  | "blister"
  | "booster-pack"
  | "deck"
  | "other";

export interface PkKindInfo {
  id: PkKind;
  label: string;
  plural: string;
  /** One honest sentence for the product page: what this kind is, nothing about value. */
  about: string;
}

// Display order = how a sealed buyer scans: the boxes first, singles of packs last.
export const PK_KINDS: readonly PkKindInfo[] = [
  {
    id: "booster-box",
    label: "Booster Box",
    plural: "Booster boxes",
    about: "A booster box (a \"display\") is a sealed carton of booster packs (36 in most English main-set boxes), sold to stores as one unit.",
  },
  {
    id: "etb",
    label: "Elite Trainer Box",
    plural: "Elite Trainer Boxes",
    about: "An Elite Trainer Box bundles booster packs with sleeves, energy cards, dice, condition markers and a storage box with dividers.",
  },
  {
    id: "pc-etb",
    label: "Pokémon Center ETB",
    plural: "Pokémon Center ETBs",
    about: "The Pokémon Center Elite Trainer Box is the official store's own version of the ETB, usually with extra booster packs and a stamped promo card.",
  },
  {
    id: "booster-bundle",
    label: "Booster Bundle",
    plural: "Booster bundles",
    about: "A booster bundle is a small sealed pack of six booster packs with no extras, often the cheapest way to buy packs in a sealed unit.",
  },
  {
    id: "upc",
    label: "Ultra-Premium Collection",
    plural: "Ultra-Premium Collections",
    about: "Ultra-Premium Collections are among the largest special boxes, with many booster packs, foil promo cards and collector extras.",
  },
  {
    id: "spc",
    label: "Super-Premium Collection",
    plural: "Super-Premium Collections",
    about: "A Super-Premium Collection is a large special box of booster packs, foil promo cards and collector extras.",
  },
  {
    id: "premium-collection",
    label: "Premium Collection",
    plural: "Premium collections",
    about: "Premium collections pair several booster packs with foil promo cards, often an oversize card or a figure, built around one Pokémon.",
  },
  {
    id: "collection",
    label: "Collection Box",
    plural: "Collection boxes",
    about: "Collection boxes, showcases and chests bundle booster packs with promo cards and accessories around a theme or a featured Pokémon.",
  },
  {
    id: "build-battle",
    label: "Build & Battle",
    plural: "Build & Battle kits",
    about: "Build & Battle boxes are prerelease kits: booster packs plus a ready-made deck core and a promo card.",
  },
  {
    id: "tin",
    label: "Tin",
    plural: "Tins",
    about: "Tins hold booster packs, usually with a foil promo card, in a collectible metal case; mini tins hold fewer packs.",
  },
  {
    id: "blister",
    label: "Blister",
    plural: "Blisters",
    about: "Blisters are the hanging retail packs: one to three booster packs on a card backing, often with a promo card or coin.",
  },
  {
    id: "booster-pack",
    label: "Booster Pack",
    plural: "Booster packs",
    about: "A single sealed booster pack. Sleeved packs are the same pack in a retail sleeve with the set's artwork.",
  },
  {
    id: "deck",
    label: "Deck or kit",
    plural: "Decks & kits",
    about: "Ready-to-play products: battle decks, league decks, trainer kits and two-player starter boxes.",
  },
  {
    id: "other",
    label: "Other sealed",
    plural: "Other sealed",
    about: "A sealed Pokémon TCG product that does not fit the usual box, bundle, tin or pack shapes.",
  },
];

const BY_ID = new Map(PK_KINDS.map((k) => [k.id, k]));

export function kindInfo(id: string): PkKindInfo {
  return BY_ID.get(id as PkKind) ?? (BY_ID.get("other") as PkKindInfo);
}

export function kindOrder(id: string): number {
  const i = PK_KINDS.findIndex((k) => k.id === id);
  return i === -1 ? PK_KINDS.length : i;
}

export function isPkKind(v: string): v is PkKind {
  return BY_ID.has(v as PkKind);
}

/** Pokémon / Pokemon / POKÉMON → "pokemon", for matching. */
export function foldName(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

// Products the POC does not price, by design (docs/pokemon/README.md, "Scope"):
// distributor cases and displays (a reseller's unit, not a buyer's), multi-product
// "[Set of N]" bundles TCGplayer invents by combining SKUs, and code cards.
const EXCLUDED =
  /\bcase\b|\bdisplay\b|\bcode cards?\b|\bonline code\b|\bbundle case\b|\bpre-?release kit\b|\bprerelease (?:pack|box)\b|\bassortment\b|\bsealed lot\b|\bmaster carton\b/;
// Non-English editions, checked on the WHOLE title: TCGplayer often says so only
// in a note ("(JP Pokemon Center Exclusive)").
const NOT_ENGLISH = /\bjp\b|japanese|korean|chinese|\bthai\b|indonesian/;

/**
 * The kind of a sealed product from its TCGplayer title, or null when the
 * product is out of scope (cases, displays, "[Set of N]" bundles, code cards).
 */
export function classifyPokemonSealed(name: string): PkKind | null {
  const folded = foldName(name).replace(/\s+/g, " ").trim();
  if (/\bset of \d+\b/.test(folded) || NOT_ENGLISH.test(folded)) return null;
  // Parenthetical notes describe a variant, not the kind: "(Exclusive)",
  // "(International Version)", "(Live Code Card)" on an otherwise normal tin.
  const n = folded.replace(/\s*\([^)]*\)/g, "").trim();
  if (EXCLUDED.test(n)) return null;
  if (/pokemon center elite trainer box|\bpc etb\b/.test(n)) return "pc-etb";
  if (/elite trainer box|\betb\b/.test(n)) return "etb";
  if (/ultra[- ]?premium collection/.test(n)) return "upc";
  if (/super[- ]?premium collection/.test(n)) return "spc";
  // "Greninja ex Battle Deck & 2 Booster Bundle" is a deck that comes with packs.
  if (/\bbattle decks?\b/.test(n)) return "deck";
  // "Trick or Trade BOOster Bundle 2023 - Mini Booster Pack" is one small pack
  // sold out of that bundle, not a booster bundle (packs.ts gives it no count).
  if (/\bmini[- ]booster packs?\b/.test(n)) return "booster-pack";
  if (/booster bundle/.test(n)) return "booster-bundle";
  if (/booster box|\bhalf booster box\b/.test(n)) return "booster-box";
  if (/build (?:&|and) battle/.test(n)) return "build-battle";
  if (/premium (?:\w+ )?collection|premium tournament collection/.test(n)) return "premium-collection";
  if (/\bmini tins?\b|\btins?\b/.test(n)) return "tin";
  if (/blister|checklane/.test(n)) return "blister";
  if (/(?:sleeved )?booster pack(?: \[[^\]]*\])?$|sleeved booster$|\bbooster pack$|^[^[]*\bbooster$/.test(n)) return "booster-pack";
  if (
    /\bdecks?\b|trainer kit|battle academy|my first battle|trading card game classic|\bcl\b classic|battle stadium/.test(n)
  )
    return "deck";
  if (
    /collection|showcase|collector'?s? chest|\bchest\b|\bbox\b|poster|binder|calendar|portfolio|\bpins?\b|gift set|toolkit|surprise|bundle/.test(
      n,
    )
  )
    return "collection";
  return "other";
}

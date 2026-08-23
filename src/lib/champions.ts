// Champion hub pages (/champions, /champions/[slug]).
//
// WHY A CURATED LIST AND NOT A HEURISTIC: card pages already derive a champion
// with `card.name.split(",")[0]` (see /card/[id]'s "More {champion} cards" rail).
// Audited against the real name corpus (prisma/riftbound-cards.json, 767 distinct
// names) that heuristic yields 84 distinct prefixes, of which 82 are genuine
// champions — but the 2 defects are exactly the kind that mint junk indexable
// pages, which is the opposite of what this phase is for:
//
//   1. "Allay" (from "Allay, Eager Admirer") is a Riftbound creature, NOT a
//      League champion. A bare heuristic ships /champions/allay.
//   2. "Yi" and "Master Yi" are ONE champion split across two prefixes
//      ("Yi, Meditative" / "Yi, Honed" vs "Master Yi, Tempered"), and a third
//      variant "Master" leaks in from the Legend path via a " - Starter"
//      slugify bug in prisma/seed.ts (fixed in the same commit as this file,
//      but the corrupted value is already baked into production data and into
//      prisma/meta-decks.json's `legend` field, so the alias below must stay
//      regardless).
//
// So: an explicit allowlist, an alias map, and per-champion name prefixes. Every
// name below was observed in the actual card data — none is added from general
// League knowledge, because a champion with no cards would be a thin page for a
// query we can't satisfy.
//
// ADDING A CHAMPION: only when cards for them actually exist. Check with
//   SELECT DISTINCT split_part(name, ',', 1) FROM "Card" WHERE name LIKE '%,%';
// and add the observed prefix — do not pre-empt a release.

export interface Champion {
  slug: string;
  name: string; // canonical display name
  /** Every name-prefix that resolves to this champion. The first is canonical.
   *  A card belongs to the champion when its name starts with "<prefix>,". */
  prefixes: string[];
}

// Observed prefixes from the live card corpus, minus the two defects above.
// Order is alphabetical by canonical name for the index page.
const RAW: [name: string, extraPrefixes?: string[]][] = [
  ["Ahri"], ["Akali"], ["Akshan"], ["Anivia"], ["Annie"], ["Aphelios"], ["Ashe"], ["Azir"],
  ["Bard"], ["Blitzcrank"], ["Caitlyn"], ["Darius"], ["Diana"], ["Dr. Mundo"],
  ["Draven"], ["Ekko"], ["Evelynn"], ["Ezreal"], ["Fiora"], ["Fizz"], ["Galio"],
  ["Garen"], ["Heimerdinger"], ["Hwei"], ["Irelia"], ["Ivern"], ["Janna"], ["Jax"],
  ["Jayce"], ["Jhin"], ["Jinx"], ["Kai'Sa"], ["Karma"], ["Karthus"], ["Katarina"],
  ["Kayn"], ["Kennen"], ["Kha'Zix"], ["Kog'Maw"], ["LeBlanc"], ["Lee Sin"], ["Leona"],
  ["Lillia"], ["Lucian"], ["Lux"], ["Malzahar"],
  // The three-way split documented above. "Master Yi" is canonical; "Yi" is how
  // the Unit printings are named; "Master" is the seed.ts bug's output.
  ["Master Yi", ["Yi", "Master"]],
  ["Mel"],
  ["Miss Fortune"], ["Nami"], ["Nidalee"], ["Nilah"], ["Nocturne"], ["Ornn"],
  ["Poppy"], ["Pyke"], ["Qiyana"], ["Rek'Sai"], ["Rell"], ["Renata Glasc"],
  ["Renekton"], ["Rengar"], ["Rumble"], ["Sett"], ["Shen"], ["Sivir"], ["Sona"], ["Soraka"],
  ["Syndra"], ["Taric"], ["Teemo"], ["Tryndamere"], ["Twisted Fate"], ["Udyr"],
  ["Vayne"], ["Vex"], ["Vi"], ["Viktor"], ["Volibear"], ["Warwick"], ["Xerath"],
  ["Xin Zhao"], ["Yasuo"], ["Yone"], ["Yuumi"], ["Zed"], ["Zilean"],
];

// Slug: lowercase, non-alphanumerics collapsed to "-". Chosen so the apostrophe
// and space champions land on the URLs people actually search and link:
// Kai'Sa -> kai-sa, Lee Sin -> lee-sin, Dr. Mundo -> dr-mundo.
export const championSlug = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export const CHAMPIONS: Champion[] = RAW.map(([name, extra]) => ({
  slug: championSlug(name),
  name,
  prefixes: [name, ...(extra ?? [])],
}));

const BY_SLUG = new Map(CHAMPIONS.map((c) => [c.slug, c]));
export const championBySlug = (slug: string): Champion | undefined => BY_SLUG.get(slug.toLowerCase());

// Reverse lookup used by card pages: given a card name, which champion hub (if
// any) should it link to? Returns undefined for names whose prefix isn't an
// allowlisted champion — which is how "Allay, Eager Admirer" correctly links
// nowhere instead of to a fabricated hub.
const BY_PREFIX = new Map<string, Champion>();
for (const c of CHAMPIONS) for (const p of c.prefixes) BY_PREFIX.set(p.toLowerCase(), c);

export function championForCardName(cardName: string): Champion | undefined {
  if (!cardName.includes(",")) return undefined;
  return BY_PREFIX.get(cardName.split(",")[0].trim().toLowerCase());
}

/** Prisma OR-clause matching every card belonging to a champion, across all its
 *  name prefixes and every set. Kept here so the index page, the hub page and
 *  card pages can never disagree on what "an Irelia card" is. */
export function championCardWhere(c: Champion) {
  return { OR: c.prefixes.map((p) => ({ name: { startsWith: `${p},` } })) };
}

// Minimum tracked printings for a champion hub to be worth indexing. Below
// this the page still renders, is still linked and is still crawlable; it
// just carries robots: noindex and is left out of sitemaps/champions.xml.
//
// PREVIOUSLY mirrored FACET_THIN_THRESHOLD (8) in lib/facets.ts on the theory
// that they're "the same judgement about the same kind of page" — they are
// not. A facet page is a name, a one-line description and a card grid, thin
// below ~8 cards. A champion hub runs buildCollectionNarrative(), which
// generates unique price-concentration analysis, domain/set breakdown and
// tournament-deck data from the champion's own live data — GROWTH-AUDIT.md's
// content audit measured champion pages at a 397-word median of actual
// narrative and rated the template "acceptable" independently of printing
// count. Borrowing the facet number was noindexing pages that already clear a
// real content bar, undercutting the whole reason this template exists (see
// the doc comment in app/champions/[slug]/page.tsx on riftdecks.com).
//
// 4, not lower, because collection-narrative.ts's own richest branch — the
// price-range/median/concentration paragraph and the "cards to know" line —
// only activates at >= 4 priced members; below that the narrative is real but
// noticeably shorter, which is the actual thin-content line for this template.
export const CHAMPION_THIN_THRESHOLD = 4;

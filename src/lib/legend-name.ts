// How an importer turns a Legend's source data into its catalogue name
// ("Champion, Title"). Shared by scripts/sync-cards.ts (RiftScribe),
// scripts/fetch-set-official.ts + import-set-cards.ts (Riot's gallery) and
// prisma/seed.ts, because each used to carry its own copy and each copy had
// its own bug:
//
//  - RiftScribe names Proving Grounds' four Legends with a product label,
//    "Wuju Bladesman - Starter". sync-cards slugified that whole string, so it
//    no longer matched the tail of card-names.json's "master-yi-wuju-bladesman",
//    and the fallback took only the slug's FIRST token: OGS-019 became
//    "Master, Wuju Bladesman - Starter". seed.ts had been patched for the match
//    but still kept the label in the name; sync-cards never was, and it
//    rewrites every name on each run, so the bad name came back every sync.
//  - Riot's gallery carries a Legend's champion in its tags, but not always
//    first: Heart of the Tempest (VEN-155) lists "Yordle" before "Kennen", and
//    fetch-set-official took tags[0], naming it "Yordle, Heart of the Tempest".
//
// Pure: no database, no request state.
import { CHAMPIONS } from "./champions";

// Product labels a source appends to a card's name that are not part of it.
const EDITION_SUFFIX = /\s*-\s*Starter$/i;
export const stripEditionSuffix = (name: string): string => name.replace(EDITION_SUFFIX, "").trim();

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
// Letters and digits only: "Kai'Sa", "kaisa" and "kai-sa" all flatten to "kaisa".
const flat = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// Display names for champion slugs that title-casing gets wrong. Includes a few
// champions with no Riftbound card yet, so a new set's Legend is spelt right.
const CHAMP_OVERRIDES: Record<string, string> = {
  kaisa: "Kai'Sa", velkoz: "Vel'Koz", chogath: "Cho'Gath", khazix: "Kha'Zix",
  reksai: "Rek'Sai", belveth: "Bel'Veth", ksante: "K'Sante", leblanc: "LeBlanc",
  drmundo: "Dr. Mundo", "nunu-willump": "Nunu & Willump", "jarvan-iv": "Jarvan IV",
};

export function titleCaseChampSlug(slug: string): string {
  if (CHAMP_OVERRIDES[slug]) return CHAMP_OVERRIDES[slug];
  const f = slug.replace(/-/g, "");
  if (CHAMP_OVERRIDES[f]) return CHAMP_OVERRIDES[f];
  return slug
    .split("-")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

// Every champion we know, by flattened name → canonical display name. Only
// CANONICAL names: champions.ts also lists "Yi" and "Master" as aliases of
// Master Yi, and "Master" is precisely the bad name this module exists to stop
// minting, so aliases never count as a champion here.
const KNOWN = new Map<string, string>([
  ...CHAMPIONS.map((c) => [flat(c.name), c.name] as [string, string]),
  ...Object.values(CHAMP_OVERRIDES).map((n) => [flat(n), n] as [string, string]),
]);
export const knownChampionName = (s: string): string | undefined => KNOWN.get(flat(s));

/**
 * RiftScribe path: the Legend's slug from card-names.json
 * ("master-yi-wuju-bladesman") and its source epithet ("Wuju Bladesman - Starter")
 * → "Master Yi, Wuju Bladesman".
 *
 * The champion is the slug minus the epithet's own slug. When that doesn't line
 * up, it is the LONGEST leading run of slug tokens that is a known champion —
 * never just the first token, which is how "Master Yi" became "Master". No
 * match at all leaves the title unprefixed rather than inventing a champion.
 */
export function legendNameFromSlug(nameSlug: string | undefined, epithet: string): string {
  const title = stripEditionSuffix(epithet);
  if (!nameSlug) return title;
  const epiSlug = slugify(title);
  let champ: string | undefined;
  if (epiSlug && nameSlug.endsWith("-" + epiSlug)) {
    champ = titleCaseChampSlug(nameSlug.slice(0, nameSlug.length - epiSlug.length - 1));
  } else {
    const tokens = nameSlug.split("-");
    for (let k = tokens.length - 1; k >= 1 && !champ; k--) champ = knownChampionName(tokens.slice(0, k).join(""));
  }
  if (!champ) return title;
  return withChampion(title, champ);
}

// Regions, factions and creature types that appear in a Legend's tags beside
// its champion. Only consulted when no tag is a champion we already know (a new
// set's debut, like K'Sante in Radiance), so it only has to rule out what is
// clearly not a champion.
const NON_CHAMPION_TAGS = new Set(
  [
    "Bandle City", "Bilgewater", "Demacia", "Freljord", "Ionia", "Ixtal", "Mount Targon", "Targon",
    "Noxus", "Piltover", "Shadow Isles", "Shurima", "Void", "The Void", "Zaun", "Runeterra", "Icathia",
    "Yordle", "Vastaya", "Darkin", "Demon", "Dragon", "Ascended", "Aspect", "Celestial", "Spirit",
    "Undead", "Poro", "Sprite", "Mech", "Minion", "Golem", "Beast", "Bird", "Cat", "Dog",
  ].map(flat),
);

/**
 * Gallery path: the champion a Legend belongs to, from its tags. A tag that is a
 * champion we know wins wherever it sits ("Yordle", "Kennen" → "Kennen"); else
 * the first tag that isn't a region or creature type; else none.
 */
export function pickLegendChampion(tags: readonly unknown[] | null | undefined): string | undefined {
  const list = (tags ?? []).filter((t): t is string => typeof t === "string").map((t) => t.trim()).filter(Boolean);
  for (const t of list) {
    const known = knownChampionName(t);
    if (known) return known;
  }
  return list.find((t) => !NON_CHAMPION_TAGS.has(flat(t)));
}

/** "Heart of the Tempest" + "Kennen" → "Kennen, Heart of the Tempest". */
export function withChampion(title: string, champion: string | undefined): string {
  const t = stripEditionSuffix(title);
  if (!champion) return t;
  if (t.toLowerCase().startsWith(champion.toLowerCase())) return t;
  return `${champion}, ${t}`;
}
